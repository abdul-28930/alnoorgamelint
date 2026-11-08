-- Noor Gaming Lab DB setup - match timetable
-- Idempotent. Run after 08_tournaments.sql.
--
-- tournaments.schedule_settings holds what staff chose (consoles, match minutes, buffer, days, breaks).
-- tournament_matches.scheduled_at (already there) is the kick-off time; console_no says which console (PS5 1..N).

ALTER TABLE tournaments        ADD COLUMN IF NOT EXISTS schedule_settings JSONB;
ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS console_no SMALLINT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tournament_matches_console_no_check') THEN
        ALTER TABLE tournament_matches ADD CONSTRAINT tournament_matches_console_no_check CHECK (console_no IS NULL OR console_no BETWEEN 1 AND 20);
    END IF;
END $$;

-- p_items: [{"id": "<match id>", "at": "<timestamptz>", "console": 1}, ...]. Only matches of this tournament are touched.
CREATE OR REPLACE FUNCTION save_match_schedule(p_tournament_id UUID, p_items JSONB) RETURNS INTEGER AS $$
DECLARE
    n INTEGER;
BEGIN
    UPDATE tournament_matches m
    SET scheduled_at = (i->>'at')::timestamptz, console_no = (i->>'console')::smallint
    FROM jsonb_array_elements(p_items) i
    WHERE m.id = (i->>'id')::uuid AND m.tournament_id = p_tournament_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    REVOKE ALL ON FUNCTION save_match_schedule(uuid,jsonb) FROM PUBLIC;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON FUNCTION save_match_schedule(uuid,jsonb) FROM anon; END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON FUNCTION save_match_schedule(uuid,jsonb) FROM authenticated; END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN GRANT EXECUTE ON FUNCTION save_match_schedule(uuid,jsonb) TO service_role; END IF;
END $$;

NOTIFY pgrst, 'reload schema';
