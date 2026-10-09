-- Noor Gaming Lab DB setup - cron job functions (reminders + status refresh)
-- Run AFTER 06. Safe to re-run. Called only by the server with the service-role key.
-- All times are IST text 'YYYY-MM-DD HH:MM:SS', passed in by the caller.

-- ---------------------------------------------------------------------
-- refresh_booking_statuses: persists UPCOMING -> ONGOING -> ENDED
-- (the old backend did this with three global UPDATEs on every booking read)
-- Reservations (no start_time) are left alone until they are checked in.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_booking_statuses(p_now TEXT)
RETURNS JSON AS $$
    WITH ended AS (
        UPDATE bookings SET status = 'ENDED'
        WHERE start_time IS NOT NULL AND end_at <= p_now
          AND (status = 'UPCOMING' OR (status = 'ONGOING' AND COALESCE(checked_in, false) = false))
        RETURNING 1
    ), started AS (
        UPDATE bookings SET status = 'ONGOING'
        WHERE start_time IS NOT NULL AND status = 'UPCOMING' AND start_at <= p_now AND end_at > p_now
        RETURNING 1
    )
    SELECT json_build_object('ended', (SELECT count(*) FROM ended), 'started', (SELECT count(*) FROM started));
$$ LANGUAGE sql;

-- ---------------------------------------------------------------------
-- due_reminders: at most ONE reminder per booking per run - the most urgent window it is inside.
--   5m  : starts within 5 minutes
--   30m : starts within 30 minutes
--   1h  : starts within 60 minutes
-- Using "within" (not the old fixed 2-minute slice) means a 5-minute schedule can no longer miss a booking.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION due_reminders(p_now TEXT, p_limit INTEGER DEFAULT 50)
RETURNS TABLE (id UUID, user_id UUID, start_at TEXT, kind TEXT, station_name TEXT) AS $$
    SELECT b.id, b.user_id, b.start_at, k.kind, s.name
    FROM bookings b
    LEFT JOIN stations s ON s.id = b.station_id
    CROSS JOIN LATERAL (
        SELECT CASE
            WHEN b.start_at::timestamp - p_now::timestamp <= interval '5 minutes'  THEN '5m'
            WHEN b.start_at::timestamp - p_now::timestamp <= interval '30 minutes' THEN '30m'
            ELSE '1h' END AS kind
    ) k
    WHERE b.status = 'UPCOMING'
      AND b.start_time IS NOT NULL
      AND b.start_at::timestamp >  p_now::timestamp
      AND b.start_at::timestamp - p_now::timestamp <= interval '60 minutes'
      AND NOT (CASE k.kind
                 WHEN '5m'  THEN COALESCE(b.reminder_5m_sent, false)
                 WHEN '30m' THEN COALESCE(b.reminder_30m_sent, false)
                 ELSE            COALESCE(b.reminder_1h_sent, false) END)
    ORDER BY b.start_at
    LIMIT p_limit;
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
    fn TEXT;
BEGIN
    FOREACH fn IN ARRAY ARRAY['refresh_booking_statuses(text)', 'due_reminders(text,integer)'] LOOP
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
