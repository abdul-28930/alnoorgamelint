-- Noor Gaming Lab DB setup - GTA VI booking (one dedicated PS5, solo and duo packages)
-- Idempotent. Run after 01_tables.sql.
--
-- gta_packages  the price list: solo and duo packages with hours, price and what is included
-- gta_settings  opening hours, slot length, and which packages are one continuous block
-- gta_passes    one purchase of a package by a customer; total_minutes is what they bought, used_minutes what they have played
-- gta_visits    the sessions on the single console. A short package (up to block_max_hours) is ONE visit booked at purchase;
--               a long package is played over several visits, each timed by staff, and deducted from the pass.
-- Times are IST text 'YYYY-MM-DD HH:MM:SS' like the other bookings. Extra hours are not charged by the hour: the customer buys another package.

CREATE TABLE IF NOT EXISTS gta_settings (
    id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    open_time       TEXT NOT NULL DEFAULT '09:00' CHECK (open_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    close_time      TEXT NOT NULL DEFAULT '23:30' CHECK (close_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    slot_minutes    INTEGER NOT NULL DEFAULT 60 CHECK (slot_minutes BETWEEN 15 AND 240),
    block_max_hours INTEGER NOT NULL DEFAULT 5 CHECK (block_max_hours BETWEEN 1 AND 24),
    max_visit_hours INTEGER NOT NULL DEFAULT 8 CHECK (max_visit_hours BETWEEN 1 AND 24)
);
INSERT INTO gta_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS gta_packages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    players     INTEGER NOT NULL CHECK (players IN (1, 2)),
    name        TEXT NOT NULL,
    hours       INTEGER NOT NULL CHECK (hours BETWEEN 1 AND 200),
    price       NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    includes    TEXT,
    badge       TEXT,
    active      BOOLEAN NOT NULL DEFAULT true,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (players, name)
);

-- the price list as printed: solo Rs 199 + 100 per hour, duo Rs 150 more; every package includes food
INSERT INTO gta_packages (players, name, hours, price, includes, badge, sort_order)
SELECT p.players, CASE WHEN p.players = 2 THEN 'Duo ' ELSE '' END || n.name, n.hours,
       199 + 100 * n.hours + CASE WHEN p.players = 2 THEN 150 ELSE 0 END,
       CASE WHEN p.players = 2 THEN '2 burgers, 2 french fries, 2 cool drinks' ELSE '1 burger, 1 french fries, 1 cool drink' END,
       CASE WHEN p.players = 1 AND n.name = 'Legend' THEN 'Best value' END,
       n.sort
FROM (VALUES (1), (2)) AS p(players)
CROSS JOIN (VALUES ('Starter', 1, 1), ('Power', 2, 2), ('Pro', 3, 3), ('Ultimate', 4, 4), ('Legend', 5, 5),
                   ('Elite', 10, 6), ('Marathon', 15, 7), ('Immortal', 20, 8), ('No Limit', 24, 9)) AS n(name, hours, sort)
ON CONFLICT (players, name) DO NOTHING;

CREATE TABLE IF NOT EXISTS gta_passes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    guest_name     TEXT,
    guest_phone    TEXT,
    package_id     UUID REFERENCES gta_packages(id) ON DELETE SET NULL,
    package_name   TEXT NOT NULL,
    players        INTEGER NOT NULL,
    hours          INTEGER NOT NULL,
    price          NUMERIC(10,2) NOT NULL,
    includes       TEXT,
    total_minutes  INTEGER NOT NULL CHECK (total_minutes > 0),
    used_minutes   INTEGER NOT NULL DEFAULT 0 CHECK (used_minutes >= 0),
    status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
    payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PARTIAL', 'PAID')),
    amount_paid    NUMERIC(10,2) NOT NULL DEFAULT 0,
    payment_method TEXT,
    food_served    BOOLEAN NOT NULL DEFAULT false,
    notes          TEXT,
    created_by     UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (user_id IS NOT NULL OR (guest_name IS NOT NULL AND length(btrim(guest_name)) > 0))
);
CREATE INDEX IF NOT EXISTS idx_gta_passes_user ON gta_passes (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS gta_visits (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pass_id             UUID NOT NULL REFERENCES gta_passes(id) ON DELETE CASCADE,
    start_at            TEXT NOT NULL,
    end_at              TEXT NOT NULL,
    duration_minutes    INTEGER NOT NULL CHECK (duration_minutes > 0),
    status              TEXT NOT NULL DEFAULT 'UPCOMING' CHECK (status IN ('UPCOMING', 'ONGOING', 'ENDED', 'CANCELLED')),
    checked_in_at       TIMESTAMPTZ,
    timer_started_at    TIMESTAMPTZ,
    timer_total_seconds INTEGER NOT NULL DEFAULT 0,
    minutes_counted     INTEGER NOT NULL DEFAULT 0,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gta_visits_start ON gta_visits (start_at) WHERE status IN ('UPCOMING', 'ONGOING');
CREATE INDEX IF NOT EXISTS idx_gta_visits_pass  ON gta_visits (pass_id);

-- server only: no policies, so the browser cannot read or write these tables directly
ALTER TABLE gta_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE gta_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE gta_passes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE gta_visits   ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- gta_add_visit: books one visit on the single console for a pass.
--   PASS_NOT_ACTIVE / BAD_DURATION / NOT_ENOUGH_TIME:<minutes left to book> / OUTSIDE_HOURS / BAD_SLOT / IN_PAST / SLOT_TAKEN
-- Customers book on the slot grid and in the future; staff (p_staff) may start at any minute and in the past (walk-ins).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gta_add_visit(p_pass_id UUID, p_start_at TEXT, p_duration_minutes INTEGER, p_now_ist TEXT, p_staff BOOLEAN DEFAULT false)
RETURNS JSON AS $$
DECLARE
    s       gta_settings%ROWTYPE;
    pass    gta_passes%ROWTYPE;
    v_end   TEXT;
    v_day   TEXT := left(p_start_at, 10);
    v_open  TEXT;
    v_close TEXT;
    v_booked INTEGER;
    v_left  INTEGER;
    v_id    UUID;
BEGIN
    SELECT * INTO s FROM gta_settings WHERE id = 1;
    PERFORM pg_advisory_xact_lock(hashtext('gta-console'));
    SELECT * INTO pass FROM gta_passes WHERE id = p_pass_id FOR UPDATE;
    IF NOT FOUND OR pass.status <> 'ACTIVE' THEN RAISE EXCEPTION 'PASS_NOT_ACTIVE'; END IF;
    IF p_duration_minutes IS NULL OR p_duration_minutes < 15 OR p_duration_minutes > s.max_visit_hours * 60
       OR (NOT p_staff AND p_duration_minutes % s.slot_minutes <> 0) THEN
        RAISE EXCEPTION 'BAD_DURATION';
    END IF;

    SELECT COALESCE(sum(duration_minutes), 0) INTO v_booked FROM gta_visits WHERE pass_id = pass.id AND status IN ('UPCOMING', 'ONGOING');
    v_left := pass.total_minutes - pass.used_minutes - v_booked;
    IF p_duration_minutes > v_left THEN RAISE EXCEPTION 'NOT_ENOUGH_TIME:%', greatest(v_left, 0); END IF;

    v_open  := v_day || ' ' || s.open_time || ':00';
    v_close := v_day || ' ' || s.close_time || ':00';
    v_end   := to_char(p_start_at::timestamp + make_interval(mins => p_duration_minutes), 'YYYY-MM-DD HH24:MI:SS');
    IF p_start_at < v_open OR v_end > v_close THEN RAISE EXCEPTION 'OUTSIDE_HOURS'; END IF;
    IF NOT p_staff THEN
        IF (extract(epoch FROM (p_start_at::timestamp - v_open::timestamp)) / 60)::int % s.slot_minutes <> 0 THEN RAISE EXCEPTION 'BAD_SLOT'; END IF;
        IF p_start_at < p_now_ist THEN RAISE EXCEPTION 'IN_PAST'; END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM gta_visits WHERE status IN ('UPCOMING', 'ONGOING') AND start_at < v_end AND end_at > p_start_at) THEN
        RAISE EXCEPTION 'SLOT_TAKEN';
    END IF;

    INSERT INTO gta_visits (pass_id, start_at, end_at, duration_minutes) VALUES (pass.id, p_start_at, v_end, p_duration_minutes) RETURNING id INTO v_id;
    RETURN json_build_object('visit_id', v_id, 'pass_id', pass.id, 'start_at', p_start_at, 'end_at', v_end);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- gta_buy: a customer (user_id) or a walk-in (guest) buys a package. A package of up to block_max_hours is one continuous visit,
-- booked now (p_start_at required); a longer one is just the purchase, and the visits are booked afterwards.
--   PACKAGE_NOT_FOUND / START_REQUIRED / the gta_add_visit errors (the purchase is undone with them)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gta_buy(p_user_id UUID, p_guest_name TEXT, p_guest_phone TEXT, p_package_id UUID, p_start_at TEXT, p_now_ist TEXT, p_staff BOOLEAN, p_created_by UUID)
RETURNS JSON AS $$
DECLARE
    s       gta_settings%ROWTYPE;
    pk      gta_packages%ROWTYPE;
    v_pass  UUID;
    v_visit JSON;
BEGIN
    SELECT * INTO s  FROM gta_settings WHERE id = 1;
    SELECT * INTO pk FROM gta_packages WHERE id = p_package_id AND active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND'; END IF;
    IF pk.hours <= s.block_max_hours AND p_start_at IS NULL THEN RAISE EXCEPTION 'START_REQUIRED'; END IF;

    INSERT INTO gta_passes (user_id, guest_name, guest_phone, package_id, package_name, players, hours, price, includes, total_minutes, created_by)
    VALUES (p_user_id, NULLIF(btrim(p_guest_name), ''), NULLIF(btrim(p_guest_phone), ''), pk.id, pk.name, pk.players, pk.hours, pk.price, pk.includes, pk.hours * 60, p_created_by)
    RETURNING id INTO v_pass;

    IF pk.hours <= s.block_max_hours THEN
        v_visit := gta_add_visit(v_pass, p_start_at, pk.hours * 60, p_now_ist, p_staff);
    END IF;
    RETURN json_build_object('pass_id', v_pass, 'visit', v_visit);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- gta_visit_start: the player arrives and staff start the timer (one session at a time on the single console)
--   VISIT_NOT_FOUND / NOT_STARTABLE / CONSOLE_BUSY
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gta_visit_start(p_visit_id UUID) RETURNS JSON AS $$
DECLARE
    v gta_visits%ROWTYPE;
BEGIN
    SELECT * INTO v FROM gta_visits WHERE id = p_visit_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'VISIT_NOT_FOUND'; END IF;
    IF v.status <> 'UPCOMING' THEN RAISE EXCEPTION 'NOT_STARTABLE'; END IF;
    IF EXISTS (SELECT 1 FROM gta_visits WHERE status = 'ONGOING' AND id <> v.id) THEN RAISE EXCEPTION 'CONSOLE_BUSY'; END IF;
    UPDATE gta_visits SET status = 'ONGOING', checked_in_at = now(), timer_started_at = now() WHERE id = v.id;
    RETURN json_build_object('visit_id', v.id, 'status', 'ONGOING');
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- gta_visit_stop: stops the timer; the minutes played (rounded up) are deducted from the pass. A short (block) package is finished by its
-- one visit; a long package finishes when everything bought is used.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gta_visit_stop(p_visit_id UUID) RETURNS JSON AS $$
DECLARE
    s       gta_settings%ROWTYPE;
    v       gta_visits%ROWTYPE;
    pass    gta_passes%ROWTYPE;
    v_secs  INTEGER;
    v_min   INTEGER;
BEGIN
    SELECT * INTO s FROM gta_settings WHERE id = 1;
    SELECT * INTO v FROM gta_visits WHERE id = p_visit_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'VISIT_NOT_FOUND'; END IF;
    IF v.status <> 'ONGOING' THEN RAISE EXCEPTION 'NOT_RUNNING'; END IF;
    SELECT * INTO pass FROM gta_passes WHERE id = v.pass_id FOR UPDATE;

    v_secs := v.timer_total_seconds + greatest(0, floor(extract(epoch FROM (now() - v.timer_started_at)))::int);
    v_min  := ceil(v_secs / 60.0)::int;
    UPDATE gta_visits SET status = 'ENDED', timer_started_at = NULL, timer_total_seconds = v_secs, minutes_counted = v_min WHERE id = v.id;
    UPDATE gta_passes SET used_minutes = used_minutes + v_min,
        status = CASE WHEN pass.hours <= s.block_max_hours OR used_minutes + v_min >= total_minutes THEN 'COMPLETED' ELSE status END
    WHERE id = pass.id
    RETURNING * INTO pass;
    RETURN json_build_object('minutes_played', v_min, 'used_minutes', pass.used_minutes, 'total_minutes', pass.total_minutes, 'remaining_minutes', pass.total_minutes - pass.used_minutes, 'pass_status', pass.status);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- gta_visit_cancel: an UPCOMING visit is cancelled (by its owner when p_user_id is given, or by staff). A short package with nothing
-- played is cancelled with it.
--   VISIT_NOT_FOUND / NOT_CANCELLABLE
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gta_visit_cancel(p_visit_id UUID, p_user_id UUID DEFAULT NULL) RETURNS JSON AS $$
DECLARE
    s    gta_settings%ROWTYPE;
    v    gta_visits%ROWTYPE;
    pass gta_passes%ROWTYPE;
BEGIN
    SELECT * INTO s FROM gta_settings WHERE id = 1;
    SELECT * INTO v FROM gta_visits WHERE id = p_visit_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'VISIT_NOT_FOUND'; END IF;
    SELECT * INTO pass FROM gta_passes WHERE id = v.pass_id FOR UPDATE;
    IF p_user_id IS NOT NULL AND pass.user_id IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'VISIT_NOT_FOUND'; END IF;
    IF v.status <> 'UPCOMING' THEN RAISE EXCEPTION 'NOT_CANCELLABLE'; END IF;
    UPDATE gta_visits SET status = 'CANCELLED' WHERE id = v.id;
    IF pass.hours <= s.block_max_hours AND pass.used_minutes = 0 THEN UPDATE gta_passes SET status = 'CANCELLED' WHERE id = pass.id; END IF;
    RETURN json_build_object('visit_id', v.id, 'pass_cancelled', pass.hours <= s.block_max_hours AND pass.used_minutes = 0);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- gta_pass_pay: staff record what the customer has paid (a total, not an increment)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gta_pass_pay(p_pass_id UUID, p_amount NUMERIC, p_method TEXT) RETURNS JSON AS $$
DECLARE
    pass gta_passes%ROWTYPE;
    v_status TEXT;
BEGIN
    IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'BAD_AMOUNT'; END IF;
    SELECT * INTO pass FROM gta_passes WHERE id = p_pass_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PASS_NOT_FOUND'; END IF;
    v_status := CASE WHEN p_amount >= pass.price THEN 'PAID' WHEN p_amount > 0 THEN 'PARTIAL' ELSE 'PENDING' END;
    UPDATE gta_passes SET amount_paid = p_amount, payment_status = v_status, payment_method = COALESCE(NULLIF(btrim(p_method), ''), payment_method) WHERE id = pass.id;
    RETURN json_build_object('payment_status', v_status, 'amount_paid', p_amount);
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    fn TEXT;
BEGIN
    FOREACH fn IN ARRAY ARRAY[
        'gta_add_visit(uuid,text,integer,text,boolean)',
        'gta_buy(uuid,text,text,uuid,text,text,boolean,uuid)',
        'gta_visit_start(uuid)',
        'gta_visit_stop(uuid)',
        'gta_visit_cancel(uuid,uuid)',
        'gta_pass_pay(uuid,numeric,text)'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn); END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn); END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn); END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON gta_settings, gta_packages, gta_passes, gta_visits TO service_role;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
