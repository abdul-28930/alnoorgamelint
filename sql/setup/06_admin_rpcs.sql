-- Noor Gaming Lab DB setup - admin functions for the Next.js API
-- Run AFTER 05. Safe to re-run. Called only by the server with the service-role key.

-- ---------------------------------------------------------------------
-- extend_booking_hour: +1 hour, atomically, keeping every dependent field consistent
-- (the old code only bumped duration/total, leaving end_at, remaining_amount and payment_status stale)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION extend_booking_hour(p_booking_id UUID)
RETURNS JSON AS $$
DECLARE
    b         bookings%ROWTYPE;
    v_rate    NUMERIC;
    v_total   NUMERIC(10,2);
    v_rem     NUMERIC(10,2);
    v_new_end TIMESTAMP;
BEGIN
    SELECT * INTO b FROM bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
    IF b.status IN ('CANCELLED', 'ENDED') THEN RAISE EXCEPTION 'NOT_EXTENDABLE'; END IF;

    SELECT COALESCE(b.custom_hourly_rate, s.hourly_rate) INTO v_rate
    FROM (SELECT 1) x LEFT JOIN stations s ON s.id = b.station_id;
    IF v_rate IS NULL THEN RAISE EXCEPTION 'STATION_REQUIRED'; END IF;

    v_total := COALESCE(b.total_amount, 0) + round(v_rate * COALESCE(b.user_count, 1), 2);
    v_rem   := greatest(0, v_total - COALESCE(b.amount_paid, 0));
    v_new_end := b.end_at::timestamp + interval '1 hour';

    UPDATE bookings SET
        duration_hours        = COALESCE(duration_hours, 1) + 1,
        total_amount          = v_total,
        original_amount       = COALESCE(original_amount, 0) + round(v_rate * COALESCE(user_count, 1), 2),
        remaining_amount      = v_rem,
        end_at                = to_char(v_new_end, 'YYYY-MM-DD HH24:MI:SS'),
        end_time              = CASE WHEN start_time IS NULL THEN NULL ELSE v_new_end::time END,
        paid                  = (v_rem = 0),
        payment_status        = CASE WHEN v_rem = 0 THEN 'PAID'
                                     WHEN COALESCE(amount_paid, 0) > 0 THEN 'PARTIAL'
                                     ELSE 'PENDING' END,
        grace_time_started_at = NULL,
        auto_extended_hours   = COALESCE(auto_extended_hours, 0) + 1
    WHERE id = b.id;

    RETURN json_build_object('message', 'Booking extended by 1 hour', 'new_total', v_total);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- confirm_prepaid_card: staff confirms they received payment; minutes become usable
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION confirm_prepaid_card(p_card_id UUID)
RETURNS user_prepaid_cards AS $$
DECLARE
    c user_prepaid_cards;
BEGIN
    UPDATE user_prepaid_cards SET status = 'ACTIVE', updated_at = now()
    WHERE id = p_card_id AND status = 'PENDING'
    RETURNING * INTO c;
    IF NOT FOUND THEN
        IF EXISTS (SELECT 1 FROM user_prepaid_cards WHERE id = p_card_id) THEN
            RAISE EXCEPTION 'ALREADY_ACTIVE';
        END IF;
        RAISE EXCEPTION 'CARD_NOT_FOUND';
    END IF;
    RETURN c;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    fn TEXT;
BEGIN
    FOREACH fn IN ARRAY ARRAY['extend_booking_hour(uuid)', 'confirm_prepaid_card(uuid)'] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
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
