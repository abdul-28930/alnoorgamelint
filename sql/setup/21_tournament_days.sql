-- Noor Gaming Lab DB setup - one tournament played over several days
-- Idempotent. Run after 08_tournaments.sql, 09_tournament_images.sql, 12_tournament_noshow.sql and 17_tournament_walkin_contacts.sql.
--
-- Splitting a tournament (say 128 players) into days creates one child tournament per day ("<name> - Day 1", "<name> - Day 2").
-- Each day has its own players, waitlist, bracket, schedule, results and standings, so everything that works for one
-- tournament works for each day. The original stays as the hub (tournaments.split_days says how many days).

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS parent_id  UUID REFERENCES tournaments(id) ON DELETE CASCADE;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS day_no     SMALLINT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS split_days SMALLINT;
CREATE INDEX IF NOT EXISTS idx_tournaments_parent ON tournaments (parent_id);

-- the view was created with t.*, so it has to be rebuilt to include the new columns
DROP VIEW IF EXISTS tournament_overview;
CREATE VIEW tournament_overview AS
SELECT t.*,
       (SELECT count(*) FROM tournament_entrants e
         WHERE e.tournament_id = t.id AND e.status IN ('registered', 'checked_in'))::int AS registered_count,
       (SELECT count(*) FROM tournament_entrants e
         WHERE e.tournament_id = t.id AND e.status = 'waitlist')::int                    AS waitlist_count
FROM tournaments t;

DO $$
BEGIN
    REVOKE ALL ON tournament_overview FROM PUBLIC;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON tournament_overview FROM anon; END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON tournament_overview FROM authenticated; END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN GRANT SELECT ON tournament_overview TO service_role; END IF;
END $$;

-- ---------------------------------------------------------------------
-- split_tournament_into_days: creates the day tournaments and moves the players, in one transaction.
-- p_days: [{"name": "...", "max_players": 64, "starts_at": "<timestamptz or null>", "active": [entrant ids], "waitlist": [entrant ids]}, ...]
-- Players not listed (withdrawn, disqualified) stay with the original. Returns the new tournament ids, in day order.
--   TOURNAMENT_NOT_FOUND / NOT_SPLITTABLE (already a day, or already split) / ALREADY_STARTED / TEAMS_NOT_SUPPORTED / INVALID_DAYS
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION split_tournament_into_days(p_parent_id UUID, p_days JSONB) RETURNS JSON AS $$
DECLARE
    t      tournaments%ROWTYPE;
    d      JSONB;
    n      INTEGER := 0;
    v_id   UUID;
    v_ids  UUID[] := '{}';
BEGIN
    SELECT * INTO t FROM tournaments WHERE id = p_parent_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND'; END IF;
    IF t.parent_id IS NOT NULL OR t.split_days IS NOT NULL THEN RAISE EXCEPTION 'NOT_SPLITTABLE'; END IF;
    IF t.started_at IS NOT NULL OR t.status IN ('active', 'completed') OR EXISTS (SELECT 1 FROM tournament_matches WHERE tournament_id = t.id) THEN
        RAISE EXCEPTION 'ALREADY_STARTED';
    END IF;
    IF t.team_size > 1 THEN RAISE EXCEPTION 'TEAMS_NOT_SUPPORTED'; END IF;
    IF jsonb_typeof(p_days) <> 'array' OR jsonb_array_length(p_days) < 2 OR jsonb_array_length(p_days) > 7 THEN RAISE EXCEPTION 'INVALID_DAYS'; END IF;

    FOR d IN SELECT * FROM jsonb_array_elements(p_days) LOOP
        n := n + 1;
        -- a copy of every setting of the original; a day is a knockout with a third-place match (needed for the top 4)
        INSERT INTO tournaments
        SELECT (jsonb_populate_record(NULL::tournaments, to_jsonb(t) || jsonb_build_object(
            'id', gen_random_uuid(),
            'name', d->>'name',
            'max_players', (d->>'max_players')::int,
            'starts_at', NULLIF(d->>'starts_at', ''),
            'parent_id', t.id,
            'day_no', n,
            'split_days', NULL,
            'third_place_match', true,
            'view_count', 0,
            'champion_entrant_id', NULL,
            'started_at', NULL,
            'completed_at', NULL,
            'schedule_settings', NULL,
            'created_at', now()
        ))).*
        RETURNING id INTO v_id;
        v_ids := v_ids || v_id;

        UPDATE tournament_entrants
        SET tournament_id = v_id, seed = NULL, no_show = false,
            status = CASE WHEN status = 'checked_in' THEN 'checked_in' ELSE 'registered' END
        WHERE tournament_id = p_parent_id AND status IN ('registered', 'checked_in')
          AND id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(d->'active', '[]'::jsonb)) x);

        UPDATE tournament_entrants
        SET tournament_id = v_id, seed = NULL, no_show = false, status = 'waitlist'
        WHERE tournament_id = p_parent_id AND status IN ('waitlist', 'registered', 'checked_in')
          AND id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(d->'waitlist', '[]'::jsonb)) x);
    END LOOP;

    UPDATE tournaments SET split_days = n WHERE id = p_parent_id;
    RETURN json_build_object('days', to_json(v_ids));
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- move_entrant_to_day: staff move one player to another day of the same tournament (before either bracket exists).
-- The player joins the other day's list, or its waitlist when that day is full. Returns the status they got there.
--   ENTRANT_NOT_MOVABLE / NOT_SIBLINGS / ALREADY_STARTED
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION move_entrant_to_day(p_entrant_id UUID, p_to_tournament_id UUID) RETURNS JSON AS $$
DECLARE
    e       tournament_entrants%ROWTYPE;
    src     tournaments%ROWTYPE;
    dst     tournaments%ROWTYPE;
    v_count INTEGER;
    v_status TEXT;
BEGIN
    SELECT * INTO e FROM tournament_entrants WHERE id = p_entrant_id FOR UPDATE;
    IF NOT FOUND OR e.status NOT IN ('registered', 'checked_in', 'waitlist') THEN RAISE EXCEPTION 'ENTRANT_NOT_MOVABLE'; END IF;

    -- lock both days in a fixed order so two moves at once cannot deadlock
    PERFORM 1 FROM tournaments WHERE id IN (e.tournament_id, p_to_tournament_id) ORDER BY id FOR UPDATE;
    SELECT * INTO src FROM tournaments WHERE id = e.tournament_id;
    SELECT * INTO dst FROM tournaments WHERE id = p_to_tournament_id;
    IF dst.id IS NULL OR src.parent_id IS NULL OR src.parent_id IS DISTINCT FROM dst.parent_id OR src.id = dst.id THEN RAISE EXCEPTION 'NOT_SIBLINGS'; END IF;
    IF EXISTS (SELECT 1 FROM tournament_matches WHERE tournament_id IN (src.id, dst.id)) OR src.started_at IS NOT NULL OR dst.started_at IS NOT NULL THEN
        RAISE EXCEPTION 'ALREADY_STARTED';
    END IF;

    SELECT count(*) INTO v_count FROM tournament_entrants WHERE tournament_id = dst.id AND status IN ('registered', 'checked_in');
    v_status := CASE WHEN v_count >= dst.max_players THEN 'waitlist' ELSE 'registered' END;

    -- a registration moved onto the waitlist goes to the back of it; the registered time orders the lists
    UPDATE tournament_entrants SET tournament_id = dst.id, status = v_status, seed = NULL, no_show = false, registered_at = now() WHERE id = e.id;
    RETURN json_build_object('status', v_status, 'tournament_id', dst.id);
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    fn TEXT;
BEGIN
    FOREACH fn IN ARRAY ARRAY['split_tournament_into_days(uuid,jsonb)', 'move_entrant_to_day(uuid,uuid)'] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn); END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn); END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn); END IF;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
