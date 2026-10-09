-- Noor Gaming Lab DB setup - backend functions for the Next.js API
-- Run AFTER 01-04. Safe to re-run.
-- These are called only by the server with the service-role key (EXECUTE is revoked from anon/authenticated).
-- Errors are raised as short codes (e.g. 'SLOT_TAKEN') that the API maps to HTTP statuses.

-- ---------------------------------------------------------------------
-- Columns / indexes
-- ---------------------------------------------------------------------
-- Prepaid purchases are confirmed by staff before minutes can be used.
ALTER TABLE user_prepaid_cards
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PENDING';
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_prepaid_cards_status_check') THEN
        ALTER TABLE user_prepaid_cards ADD CONSTRAINT user_prepaid_cards_status_check
            CHECK (status IN ('PENDING', 'ACTIVE'));
    END IF;
END $$;

-- Reservations (no fixed slot yet) are stored with status 'PENDING'; 01_tables.sql's check omitted it.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
    CHECK (status IN ('PENDING', 'UPCOMING', 'ONGOING', 'ENDED', 'CANCELLED'));

-- A user may redeem a referral code only once.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS referred_by UUID;

CREATE INDEX IF NOT EXISTS idx_bookings_status_start   ON bookings(status, start_at);
CREATE INDEX IF NOT EXISTS idx_bookings_user_start     ON bookings(user_id, start_at);
CREATE INDEX IF NOT EXISTS idx_bookings_reminders      ON bookings(start_at)
    WHERE status = 'UPCOMING' AND (reminder_1h_sent = false OR reminder_30m_sent = false OR reminder_5m_sent = false);
CREATE INDEX IF NOT EXISTS idx_prepaid_cards_user      ON user_prepaid_cards(user_id, status);

-- ---------------------------------------------------------------------
-- create_booking: station choice + overlap check + coupon + insert, atomically
-- ---------------------------------------------------------------------
-- Times are IST text 'YYYY-MM-DD HH:MM:SS'. A reservation has p_start_time NULL
-- (no fixed slot; a station is assigned at check-in).
CREATE OR REPLACE FUNCTION create_booking(
    p_user_id        UUID,
    p_station_id     UUID,
    p_station_type   TEXT,
    p_start_at       TEXT,
    p_end_at         TEXT,
    p_start_time     TEXT,
    p_end_time       TEXT,
    p_duration_hours INTEGER,
    p_user_count     INTEGER,
    p_advance        BOOLEAN,
    p_food_items     JSON,
    p_food_total     NUMERIC,
    p_coupon_code    TEXT
) RETURNS bookings AS $$
DECLARE
    v_is_reservation BOOLEAN := p_start_time IS NULL;
    v_station        stations%ROWTYPE;
    v_assign_id      UUID;
    v_base           NUMERIC(10,2);
    v_discount       NUMERIC(10,2) := 0;
    v_total          NUMERIC(10,2);
    v_advance        NUMERIC(10,2) := 0;
    v_coupon         coupons%ROWTYPE;
    v_row            bookings;
BEGIN
    IF p_duration_hours IS NULL OR p_duration_hours < 1 OR p_duration_hours > 24 THEN
        RAISE EXCEPTION 'INVALID_DURATION';
    END IF;
    IF p_user_count IS NULL OR p_user_count < 1 THEN
        RAISE EXCEPTION 'INVALID_USER_COUNT';
    END IF;
    IF COALESCE(p_food_total, 0) < 0 THEN
        RAISE EXCEPTION 'INVALID_FOOD_TOTAL';
    END IF;

    IF p_station_id IS NOT NULL THEN
        SELECT * INTO v_station FROM stations WHERE id = p_station_id AND active = true;
        IF NOT FOUND THEN RAISE EXCEPTION 'STATION_NOT_FOUND'; END IF;
        v_assign_id := v_station.id;
        IF NOT v_is_reservation THEN
            PERFORM pg_advisory_xact_lock(hashtext(v_station.id::text || left(p_start_at, 10)));
            IF EXISTS (
                SELECT 1 FROM bookings b
                WHERE b.station_id = v_station.id AND b.status <> 'CANCELLED'
                  AND b.start_time IS NOT NULL
                  AND b.start_at < p_end_at AND b.end_at > p_start_at
            ) THEN
                RAISE EXCEPTION 'SLOT_TAKEN';
            END IF;
        END IF;
    ELSIF p_station_type IS NOT NULL THEN
        IF v_is_reservation THEN
            -- rate comes from the first active station of the type; no station is assigned yet
            SELECT * INTO v_station FROM stations WHERE type = p_station_type AND active = true ORDER BY name LIMIT 1;
            IF NOT FOUND THEN RAISE EXCEPTION 'NO_STATIONS_OF_TYPE'; END IF;
            v_assign_id := NULL;
        ELSE
            -- serialise concurrent bookings for this type/day, then pick the least-busy free station
            PERFORM pg_advisory_xact_lock(hashtext(p_station_type || left(p_start_at, 10)));
            SELECT s.* INTO v_station
            FROM stations s
            WHERE s.type = p_station_type AND s.active = true
              AND NOT EXISTS (
                  SELECT 1 FROM bookings b
                  WHERE b.station_id = s.id AND b.status <> 'CANCELLED'
                    AND b.start_time IS NOT NULL
                    AND b.start_at < p_end_at AND b.end_at > p_start_at)
            ORDER BY (SELECT count(*) FROM bookings b2
                      WHERE b2.station_id = s.id AND b2.status <> 'CANCELLED'
                        AND left(b2.start_at, 10) = left(p_start_at, 10)), s.name
            LIMIT 1;
            IF NOT FOUND THEN
                IF NOT EXISTS (SELECT 1 FROM stations WHERE type = p_station_type AND active = true) THEN
                    RAISE EXCEPTION 'NO_STATIONS_OF_TYPE';
                END IF;
                RAISE EXCEPTION 'SLOT_TAKEN';
            END IF;
            v_assign_id := v_station.id;
        END IF;
    ELSIF v_is_reservation THEN
        SELECT * INTO v_station FROM stations WHERE active = true ORDER BY name LIMIT 1;
        IF NOT FOUND THEN RAISE EXCEPTION 'NO_STATIONS_OF_TYPE'; END IF;
        v_assign_id := NULL;
    ELSE
        RAISE EXCEPTION 'STATION_REQUIRED';
    END IF;

    v_base := round(v_station.hourly_rate * p_duration_hours * p_user_count + COALESCE(p_food_total, 0), 2);

    IF p_coupon_code IS NOT NULL AND p_coupon_code <> '' THEN
        SELECT * INTO v_coupon FROM coupons
        WHERE code = p_coupon_code AND is_active = true AND used_by IS NULL
          AND (expires_at IS NULL OR expires_at > now())
          AND (created_for IS NULL OR created_for = p_user_id)
        FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_COUPON'; END IF;
        v_discount := round(v_base * v_coupon.discount_percentage / 100, 2);
        UPDATE coupons SET used_by = p_user_id, used_at = now() WHERE id = v_coupon.id;
    END IF;

    v_total := greatest(0, v_base - v_discount);
    -- Advance is only *expected* here; staff records the payment (amount_paid / advance_paid).
    IF p_advance THEN v_advance := round(v_total * 0.3, 2); END IF;

    INSERT INTO bookings (
        user_id, station_id, start_at, end_at, start_time, end_time, duration_hours, user_count,
        total_amount, original_amount, advance_amount, advance_paid, remaining_amount, amount_paid,
        payment_status, food_items, food_total, status, coupon_code, coupon_discount
    ) VALUES (
        p_user_id, v_assign_id, p_start_at, p_end_at,
        p_start_time::time, p_end_time::time, p_duration_hours, p_user_count,
        v_total, v_base, v_advance, false, v_total, 0,
        'PENDING', COALESCE(p_food_items, '[]'::json), COALESCE(p_food_total, 0),
        CASE WHEN v_is_reservation THEN 'PENDING' ELSE 'UPCOMING' END,
        CASE WHEN v_discount > 0 THEN p_coupon_code END, v_discount
    ) RETURNING * INTO v_row;

    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- cancel_booking: only UPCOMING/PENDING, once; full refund within 1h of creation else 5% fee; coupon restored
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_booking(p_booking_id UUID, p_user_id UUID)
RETURNS JSON AS $$
DECLARE
    b      bookings%ROWTYPE;
    v_paid NUMERIC(10,2);
    v_fee  NUMERIC(10,2);
BEGIN
    SELECT * INTO b FROM bookings WHERE id = p_booking_id AND user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
    IF b.status NOT IN ('UPCOMING', 'PENDING') THEN RAISE EXCEPTION 'NOT_CANCELLABLE'; END IF;

    v_paid := COALESCE(b.amount_paid, 0);
    v_fee  := CASE WHEN now() - b.created_at <= interval '1 hour' THEN 0 ELSE round(v_paid * 0.05, 2) END;

    UPDATE bookings
    SET status = 'CANCELLED', cancelled_at = now(),
        refund_amount = v_paid - v_fee, cancellation_fee = v_fee
    WHERE id = b.id;

    IF b.coupon_code IS NOT NULL THEN
        UPDATE coupons SET used_by = NULL, used_at = NULL
        WHERE code = b.coupon_code AND used_by = b.user_id;
    END IF;

    RETURN json_build_object('refund_amount', v_paid - v_fee, 'cancellation_fee', v_fee);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- checkin_booking: assigns the station, starts the session (IST text times), picks a prepaid card
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION checkin_booking(p_booking_id UUID, p_station_id UUID, p_now_ist TEXT)
RETURNS bookings AS $$
DECLARE
    s      stations%ROWTYPE;
    b      bookings%ROWTYPE;
    v_card user_prepaid_cards%ROWTYPE;
    v_end  TIMESTAMP;
    v_row  bookings;
BEGIN
    SELECT * INTO s FROM stations WHERE id = p_station_id AND active = true FOR UPDATE;  -- serialises per station
    IF NOT FOUND THEN RAISE EXCEPTION 'STATION_NOT_FOUND'; END IF;

    SELECT * INTO b FROM bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
    IF b.checked_in_at IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_CHECKED_IN'; END IF;
    IF b.status = 'CANCELLED' THEN RAISE EXCEPTION 'NOT_CHECKABLE'; END IF;

    IF EXISTS (
        SELECT 1 FROM bookings
        WHERE station_id = p_station_id AND checked_in = true AND id <> p_booking_id
          AND status NOT IN ('CANCELLED', 'ENDED')
    ) THEN
        RAISE EXCEPTION 'STATION_BUSY';
    END IF;

    v_end := p_now_ist::timestamp + make_interval(hours => COALESCE(b.duration_hours, 1));

    SELECT * INTO v_card FROM user_prepaid_cards
    WHERE user_id = b.user_id AND status = 'ACTIVE' AND remaining_minutes > 0
    ORDER BY created_at LIMIT 1;

    UPDATE bookings SET
        station_id    = p_station_id,
        checked_in    = true,
        checked_in_at = now(),
        status        = 'ONGOING',
        start_at      = to_char(p_now_ist::timestamp, 'YYYY-MM-DD HH24:MI:SS'),
        end_at        = to_char(v_end, 'YYYY-MM-DD HH24:MI:SS'),
        start_time    = p_now_ist::timestamp::time,
        end_time      = v_end::time,
        billing_type  = CASE WHEN v_card.id IS NOT NULL THEN 'PREPAID' ELSE billing_type END,
        prepaid_card_id = CASE WHEN v_card.id IS NOT NULL THEN v_card.id ELSE prepaid_card_id END
    WHERE id = p_booking_id
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- stop_timer: adds elapsed time, bills prepaid minutes (accumulating across stops), updates playtime
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION stop_timer(p_booking_id UUID)
RETURNS bookings AS $$
DECLARE
    b          bookings%ROWTYPE;
    c          user_prepaid_cards%ROWTYPE;
    v_elapsed  INTEGER;
    v_first    BOOLEAN;
    v_min      INTEGER;
    v_covered  INTEGER;
    v_over_min INTEGER;
    v_over_hrs INTEGER;
    v_rate     NUMERIC;
    v_charge   NUMERIC(10,2) := 0;
    v_total    NUMERIC(10,2);
    v_row      bookings;
BEGIN
    SELECT * INTO b FROM bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
    IF b.timer_started_at IS NULL THEN RAISE EXCEPTION 'TIMER_NOT_RUNNING'; END IF;

    v_elapsed := greatest(0, floor(extract(epoch FROM (now() - b.timer_started_at)))::int);
    v_first   := COALESCE(b.timer_total_seconds, 0) = 0;

    UPDATE bookings
    SET timer_total_seconds = COALESCE(timer_total_seconds, 0) + v_elapsed, timer_started_at = NULL
    WHERE id = b.id;

    IF b.billing_type IN ('PREPAID', 'PARTIAL_PREPAID') AND b.prepaid_card_id IS NOT NULL THEN
        SELECT * INTO c FROM user_prepaid_cards WHERE id = b.prepaid_card_id FOR UPDATE;
        IF FOUND THEN
            v_min      := greatest(1, v_elapsed / 60);
            v_covered  := least(v_min, greatest(0, c.remaining_minutes));
            v_over_min := v_min - v_covered;
            v_over_hrs := ceil(v_over_min / 60.0)::int;

            SELECT COALESCE(b.custom_hourly_rate, s.hourly_rate, 120) INTO v_rate
            FROM (SELECT 1) x LEFT JOIN stations s ON s.id = b.station_id;
            v_charge := round(v_rate * v_over_hrs * COALESCE(b.user_count, 1), 2);

            UPDATE user_prepaid_cards
            SET remaining_minutes = remaining_minutes - v_covered, updated_at = now()
            WHERE id = c.id;

            -- first stop replaces the pre-set full price; later stops add to the prepaid-adjusted total
            v_total := CASE WHEN v_first THEN 0 ELSE COALESCE(b.total_amount, 0) END + v_charge;

            UPDATE bookings SET
                prepaid_minutes_used = COALESCE(prepaid_minutes_used, 0) + v_covered,
                total_amount         = v_total,
                remaining_amount     = greatest(0, v_total - COALESCE(amount_paid, 0)),
                billing_type         = CASE WHEN v_total > 0 THEN 'PARTIAL_PREPAID' ELSE 'PREPAID' END,
                payment_status       = CASE
                    WHEN v_total = 0 THEN 'PREPAID'
                    WHEN COALESCE(amount_paid, 0) >= v_total THEN 'PAID'
                    WHEN COALESCE(amount_paid, 0) > 0 THEN 'PARTIAL'
                    ELSE 'PENDING' END,
                paid                 = (greatest(0, v_total - COALESCE(amount_paid, 0)) = 0)
            WHERE id = b.id;
        END IF;
    END IF;

    UPDATE user_profiles
    SET total_playtime_seconds = COALESCE(total_playtime_seconds, 0) + v_elapsed
    WHERE user_id = b.user_id;

    SELECT * INTO v_row FROM bookings WHERE id = b.id;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Admin dashboard aggregates (replace fetch-everything-and-sum-in-Python)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_stats_summary(p_start TEXT, p_end TEXT, p_today TEXT)
RETURNS JSON AS $$
DECLARE
    v_stations INTEGER;
    r          RECORD;
BEGIN
    SELECT count(*) INTO v_stations FROM stations WHERE active = true;

    SELECT count(*)                                              AS total,
           count(*) FILTER (WHERE left(start_at, 10) = p_today)  AS today,
           count(*) FILTER (WHERE paid)                          AS paid,
           COALESCE(sum(total_amount), 0)                        AS revenue,
           count(*) FILTER (WHERE status IN ('UPCOMING', 'ONGOING')) AS occupied
    INTO r
    FROM bookings
    WHERE status <> 'CANCELLED'
      AND (p_start IS NULL OR (start_at <> '' AND left(start_at, 10) >= p_start))
      AND (p_end   IS NULL OR (start_at <> '' AND left(start_at, 10) <= p_end));

    RETURN json_build_object(
        'total_bookings', r.total,
        'today_bookings', r.today,
        'paid_bookings',  r.paid,
        'total_revenue',  r.revenue,
        'occupancy_rate', CASE WHEN v_stations = 0 THEN 0
                               ELSE round(r.occupied::numeric / (v_stations * 24) * 100, 2) END
    );
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION admin_stats_payments()
RETURNS JSON AS $$
    SELECT json_build_object(
        'total_advance_collected', COALESCE(sum(advance_amount) FILTER (WHERE advance_paid), 0),
        'total_remaining',         COALESCE(sum(remaining_amount), 0),
        'advance_bookings_count',  count(*) FILTER (WHERE advance_paid),
        'total_bookings',          count(*)
    )
    FROM bookings WHERE status <> 'CANCELLED';
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------
-- Slot availability for a station type on a date: one query instead of ~24 x stations
-- Shape matches the old endpoint: [{hour_slot, is_available, available_count, total_count, available_station}]
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_availability_by_type(p_type TEXT, p_date TEXT)
RETURNS JSON AS $$
    WITH st AS (
        SELECT s.*, (SELECT count(*) FROM bookings b
                     WHERE b.station_id = s.id AND b.status <> 'CANCELLED'
                       AND left(b.start_at, 10) = p_date) AS day_count
        FROM stations s WHERE s.type = p_type AND s.active = true
    ),
    slots AS (
        SELECT h,
               to_char(make_time(h, 0, 0), 'HH24:MI:SS')                          AS hour_slot,
               p_date || ' ' || to_char(make_time(h, 0, 0), 'HH24:MI:SS')         AS slot_start,
               CASE WHEN h = 23 THEN to_char(p_date::date + 1, 'YYYY-MM-DD') || ' 00:00:00'
                    ELSE p_date || ' ' || to_char(make_time(h + 1, 0, 0), 'HH24:MI:SS') END AS slot_end
        FROM generate_series(0, 23) h
    ),
    free AS (
        SELECT sl.h, st.*
        FROM slots sl CROSS JOIN st
        WHERE NOT EXISTS (
            SELECT 1 FROM bookings b
            WHERE b.station_id = st.id AND b.status <> 'CANCELLED'
              AND b.start_at < sl.slot_end AND b.end_at > sl.slot_start)
    )
    SELECT COALESCE(json_agg(json_build_object(
        'hour_slot',       sl.hour_slot,
        'is_available',    (SELECT count(*) FROM free f WHERE f.h = sl.h) > 0,
        'available_count', (SELECT count(*) FROM free f WHERE f.h = sl.h),
        'total_count',     (SELECT count(*) FROM st),
        'available_station', (SELECT to_jsonb(f) - 'h' - 'day_count' FROM free f WHERE f.h = sl.h
                              ORDER BY f.day_count, f.name LIMIT 1)
    ) ORDER BY sl.h), '[]'::json)
    FROM slots sl
    WHERE EXISTS (SELECT 1 FROM st);
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------
-- Lock the functions down: only the server (service role) may call them
-- ---------------------------------------------------------------------
DO $$
DECLARE
    fn TEXT;
BEGIN
    FOREACH fn IN ARRAY ARRAY[
        'create_booking(uuid,uuid,text,text,text,text,text,integer,integer,boolean,json,numeric,text)',
        'cancel_booking(uuid,uuid)',
        'checkin_booking(uuid,uuid,text)',
        'stop_timer(uuid)',
        'admin_stats_summary(text,text,text)',
        'admin_stats_payments()',
        'get_availability_by_type(text,text)'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
        -- Supabase roles; skipped silently on plain Postgres where they do not exist
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
        END IF;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
