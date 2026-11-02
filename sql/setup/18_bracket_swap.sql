-- Noor Gaming Lab DB setup - put a chosen waitlist player into a no-show's place in the bracket
-- Idempotent. Run after 08_tournaments.sql and 12_tournament_noshow.sql.
--
-- swap_bracket_entrant(tournament, out, in): the waitlisted player `in` takes the exact place of `out` everywhere
-- in the bracket (match slots, byes and the seed); `out` is withdrawn. Every other pairing stays as it was.
--   ENTRANT_NOT_REPLACEABLE  `out` is not registered/checked in for this tournament
--   NOT_ON_WAITLIST          `in` is not waiting for a place in this tournament
--   NOT_STARTED              no bracket yet (use Promote instead)
--   ALREADY_STARTED          `out` already has a live or finished match
CREATE OR REPLACE FUNCTION swap_bracket_entrant(p_tournament_id UUID, p_out UUID, p_in UUID)
RETURNS JSON AS $$
DECLARE
    t     tournaments%ROWTYPE;
    v_out tournament_entrants%ROWTYPE;
    v_in  tournament_entrants%ROWTYPE;
BEGIN
    SELECT * INTO t FROM tournaments WHERE id = p_tournament_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND'; END IF;
    IF NOT EXISTS (SELECT 1 FROM tournament_matches WHERE tournament_id = p_tournament_id) THEN RAISE EXCEPTION 'NOT_STARTED'; END IF;

    SELECT * INTO v_out FROM tournament_entrants WHERE id = p_out AND tournament_id = p_tournament_id FOR UPDATE;
    IF NOT FOUND OR v_out.status NOT IN ('registered', 'checked_in') THEN RAISE EXCEPTION 'ENTRANT_NOT_REPLACEABLE'; END IF;
    SELECT * INTO v_in FROM tournament_entrants WHERE id = p_in AND tournament_id = p_tournament_id FOR UPDATE;
    IF NOT FOUND OR v_in.status <> 'waitlist' THEN RAISE EXCEPTION 'NOT_ON_WAITLIST'; END IF;

    IF EXISTS (
        SELECT 1 FROM tournament_matches
        WHERE tournament_id = p_tournament_id AND status IN ('live', 'completed')
          AND (entrant1_id = p_out OR entrant2_id = p_out OR winner_id = p_out)
    ) THEN RAISE EXCEPTION 'ALREADY_STARTED'; END IF;

    UPDATE tournament_matches SET
        entrant1_id = CASE WHEN entrant1_id = p_out THEN p_in ELSE entrant1_id END,
        entrant2_id = CASE WHEN entrant2_id = p_out THEN p_in ELSE entrant2_id END,
        winner_id   = CASE WHEN winner_id   = p_out THEN p_in ELSE winner_id   END
    WHERE tournament_id = p_tournament_id AND (entrant1_id = p_out OR entrant2_id = p_out OR winner_id = p_out);

    UPDATE tournament_entrants SET status = 'withdrawn', seed = NULL WHERE id = p_out;
    UPDATE tournament_entrants SET status = 'registered', no_show = false, seed = v_out.seed WHERE id = p_in;

    RETURN json_build_object('replaced', p_out, 'with', p_in);
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    REVOKE ALL ON FUNCTION swap_bracket_entrant(uuid,uuid,uuid) FROM PUBLIC;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON FUNCTION swap_bracket_entrant(uuid,uuid,uuid) FROM anon; END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON FUNCTION swap_bracket_entrant(uuid,uuid,uuid) FROM authenticated; END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN GRANT EXECUTE ON FUNCTION swap_bracket_entrant(uuid,uuid,uuid) TO service_role; END IF;
END $$;

NOTIFY pgrst, 'reload schema';
