-- Noor Gaming Lab DB setup - tournament management
-- Run AFTER 07. Safe to re-run. The API calls these with the service-role key.
--
-- Model: an "entrant" is whatever plays - one player, or one team. Matches link to each other
-- (next_match_id / next_slot) so reporting a result moves the winner on inside one transaction.
-- tournament_type 'knockout' = single elimination, 'league' = round robin.

-- ---------------------------------------------------------------------
-- tournaments: extra settings and live counters
-- ---------------------------------------------------------------------
ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS rules                  TEXT,
    ADD COLUMN IF NOT EXISTS starts_at              TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS registration_closes_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS entry_fee              NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (entry_fee >= 0),
    ADD COLUMN IF NOT EXISTS prize_pool             NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (prize_pool >= 0),
    ADD COLUMN IF NOT EXISTS prize_details          TEXT,
    ADD COLUMN IF NOT EXISTS team_size              INTEGER NOT NULL DEFAULT 1 CHECK (team_size BETWEEN 1 AND 10),
    ADD COLUMN IF NOT EXISTS best_of                INTEGER NOT NULL DEFAULT 1 CHECK (best_of IN (1, 3, 5, 7)),
    ADD COLUMN IF NOT EXISTS third_place_match      BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS double_round_robin     BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS seeding                TEXT NOT NULL DEFAULT 'random' CHECK (seeding IN ('random', 'manual')),
    ADD COLUMN IF NOT EXISTS view_count             INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS champion_entrant_id    UUID,
    ADD COLUMN IF NOT EXISTS started_at             TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_at           TIMESTAMPTZ;

-- ---------------------------------------------------------------------
-- teams (used when tournaments.team_size > 1)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tournament_teams (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id  UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    captain_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tournament_teams_name_uniq ON tournament_teams (tournament_id, lower(name));

CREATE TABLE IF NOT EXISTS tournament_team_members (
    team_id        UUID NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
    tournament_id  UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status         TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'accepted')),
    invited_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (team_id, user_id)
);
-- a player can be invited by many teams but can only be on one team per tournament
CREATE UNIQUE INDEX IF NOT EXISTS tournament_team_one_team_per_player
    ON tournament_team_members (tournament_id, user_id) WHERE status = 'accepted';

-- ---------------------------------------------------------------------
-- entrants: one row per player or team taking part
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tournament_entrants (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id  UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,      -- solo player (NULL for a team or a walk-in)
    team_id        UUID REFERENCES tournament_teams(id) ON DELETE CASCADE, -- team entrant
    display_name   TEXT NOT NULL,
    seed           INTEGER,
    status         TEXT NOT NULL DEFAULT 'registered'
                   CHECK (status IN ('registered', 'waitlist', 'checked_in', 'withdrawn', 'disqualified')),
    payment_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED' CHECK (payment_status IN ('NOT_REQUIRED', 'PENDING', 'PAID')),
    registered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (NOT (user_id IS NOT NULL AND team_id IS NOT NULL))
);
-- a player is entered once per tournament (a withdrawn entry does not block signing up again)
CREATE UNIQUE INDEX IF NOT EXISTS tournament_entrants_user_uniq
    ON tournament_entrants (tournament_id, user_id) WHERE user_id IS NOT NULL AND status <> 'withdrawn';
CREATE UNIQUE INDEX IF NOT EXISTS tournament_entrants_team_uniq
    ON tournament_entrants (team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tournament_entrants_tournament ON tournament_entrants (tournament_id, status);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tournaments_champion_fk') THEN
        ALTER TABLE tournaments ADD CONSTRAINT tournaments_champion_fk
            FOREIGN KEY (champion_entrant_id) REFERENCES tournament_entrants(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- matches
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tournament_matches (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id       UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round               INTEGER NOT NULL,
    position            INTEGER NOT NULL,
    bracket             TEXT NOT NULL DEFAULT 'main' CHECK (bracket IN ('main', 'third')),
    entrant1_id         UUID REFERENCES tournament_entrants(id) ON DELETE SET NULL,
    entrant2_id         UUID REFERENCES tournament_entrants(id) ON DELETE SET NULL,
    score1              INTEGER CHECK (score1 >= 0),
    score2              INTEGER CHECK (score2 >= 0),
    winner_id           UUID REFERENCES tournament_entrants(id) ON DELETE SET NULL,
    status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'live', 'completed', 'bye')),
    best_of             INTEGER NOT NULL DEFAULT 1 CHECK (best_of IN (1, 3, 5, 7)),
    next_match_id       UUID REFERENCES tournament_matches(id) ON DELETE SET NULL,
    next_slot           INTEGER CHECK (next_slot IN (1, 2)),
    loser_next_match_id UUID REFERENCES tournament_matches(id) ON DELETE SET NULL,
    loser_next_slot     INTEGER CHECK (loser_next_slot IN (1, 2)),
    walkover            BOOLEAN NOT NULL DEFAULT false,
    scheduled_at        TIMESTAMPTZ,
    station_id          UUID REFERENCES stations(id) ON DELETE SET NULL,
    notes               TEXT,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tournament_id, bracket, round, position)
);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament ON tournament_matches (tournament_id, round, position);

DROP TRIGGER IF EXISTS update_tournament_matches_updated_at ON tournament_matches;
CREATE TRIGGER update_tournament_matches_updated_at
    BEFORE UPDATE ON tournament_matches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- one counted view per visitor per day (visitor id is a random value kept in the visitor's browser)
CREATE TABLE IF NOT EXISTS tournament_views (
    tournament_id  UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    visitor_id     TEXT NOT NULL,
    day            DATE NOT NULL,
    PRIMARY KEY (tournament_id, visitor_id, day)
);

-- ---------------------------------------------------------------------
-- Row level security: the API (service role) does all reads and writes, so the browser gets nothing directly
-- (no policies = denied). Draft tournaments are hidden from direct reads too.
-- ---------------------------------------------------------------------
ALTER TABLE tournament_teams         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_team_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_entrants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_matches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_views         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tournaments are publicly readable" ON tournaments;
CREATE POLICY "Tournaments are publicly readable" ON tournaments FOR SELECT USING (status <> 'draft' OR is_admin());

-- ---------------------------------------------------------------------
-- tournament_overview: every tournament with its live counts (server-side only)
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS tournament_overview;
CREATE VIEW tournament_overview AS
SELECT t.*,
       (SELECT count(*) FROM tournament_entrants e
         WHERE e.tournament_id = t.id AND e.status IN ('registered', 'checked_in'))::int AS registered_count,
       (SELECT count(*) FROM tournament_entrants e
         WHERE e.tournament_id = t.id AND e.status = 'waitlist')::int                    AS waitlist_count
FROM tournaments t;

-- ---------------------------------------------------------------------
-- save_bracket: replaces the matches with a freshly generated bracket and starts the tournament.
-- Allowed until a real result has been entered, so a bad seeding can be redone.
-- p_matches: [{id, round, position, bracket, entrant1_id, entrant2_id, status, winner_id, best_of,
--              next_match_id, next_slot, loser_next_match_id, loser_next_slot}]   (see server/tournaments/engine.ts)
-- p_seeds:   [{id, seed}]
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION save_bracket(p_tournament_id UUID, p_matches JSONB, p_seeds JSONB DEFAULT '[]'::jsonb)
RETURNS INTEGER AS $$
DECLARE
    t       tournaments%ROWTYPE;
    v_count INTEGER;
BEGIN
    SELECT * INTO t FROM tournaments WHERE id = p_tournament_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND'; END IF;
    IF t.status = 'completed' THEN RAISE EXCEPTION 'TOURNAMENT_COMPLETED'; END IF;
    IF EXISTS (SELECT 1 FROM tournament_matches
               WHERE tournament_id = p_tournament_id AND status IN ('live', 'completed')) THEN
        RAISE EXCEPTION 'ALREADY_STARTED';
    END IF;
    IF p_matches IS NULL OR jsonb_typeof(p_matches) <> 'array' OR jsonb_array_length(p_matches) = 0 THEN
        RAISE EXCEPTION 'NO_MATCHES';
    END IF;

    -- every entrant used must belong to this tournament and still be playing (checked before anything is written)
    IF EXISTS (
        SELECT 1 FROM jsonb_to_recordset(p_matches) AS m(entrant1_id UUID, entrant2_id UUID, winner_id UUID)
        CROSS JOIN LATERAL (VALUES (m.entrant1_id), (m.entrant2_id), (m.winner_id)) AS slot(entrant_id)
        WHERE slot.entrant_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM tournament_entrants e
                          WHERE e.id = slot.entrant_id AND e.tournament_id = p_tournament_id
                            AND e.status IN ('registered', 'checked_in'))
    ) THEN
        RAISE EXCEPTION 'INVALID_ENTRANT';
    END IF;

    DELETE FROM tournament_matches WHERE tournament_id = p_tournament_id;

    INSERT INTO tournament_matches (
        id, tournament_id, round, position, bracket, entrant1_id, entrant2_id, status, winner_id, best_of,
        next_match_id, next_slot, loser_next_match_id, loser_next_slot
    )
    SELECT m.id, p_tournament_id, m.round, m.position, COALESCE(m.bracket, 'main'), m.entrant1_id, m.entrant2_id,
           m.status, m.winner_id, COALESCE(m.best_of, 1), m.next_match_id, m.next_slot,
           m.loser_next_match_id, m.loser_next_slot
    FROM jsonb_to_recordset(p_matches) AS m(
        id UUID, round INTEGER, position INTEGER, bracket TEXT, entrant1_id UUID, entrant2_id UUID, status TEXT,
        winner_id UUID, best_of INTEGER, next_match_id UUID, next_slot INTEGER, loser_next_match_id UUID, loser_next_slot INTEGER
    );
    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE tournament_entrants e SET seed = s.seed
    FROM jsonb_to_recordset(p_seeds) AS s(id UUID, seed INTEGER)
    WHERE e.id = s.id AND e.tournament_id = p_tournament_id;

    UPDATE tournaments
    SET status = 'active', started_at = COALESCE(started_at, now()), champion_entrant_id = NULL, completed_at = NULL
    WHERE id = p_tournament_id;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- report_match_result: record a result and move the winner on, atomically.
--   * winner given (button "Won"): scores optional. Scores only: the higher score wins.
--   * a draw (equal scores, no winner) is allowed in league tournaments only.
--   * p_walkover: the winner is awarded the match without playing (no-show, disqualification).
-- Returns {match_id, winner_id, tournament_completed, champion_entrant_id}.
-- For a finished league the champion is set by the API from the standings.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION report_match_result(
    p_match_id UUID, p_score1 INTEGER, p_score2 INTEGER, p_winner UUID DEFAULT NULL, p_walkover BOOLEAN DEFAULT false
) RETURNS JSON AS $$
DECLARE
    m          tournament_matches%ROWTYPE;
    t          tournaments%ROWTYPE;
    v_winner   UUID;
    v_loser    UUID;
    v_remaining INTEGER;
    v_champion UUID;
    v_completed BOOLEAN := false;
BEGIN
    SELECT * INTO m FROM tournament_matches WHERE id = p_match_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'MATCH_NOT_FOUND'; END IF;
    SELECT * INTO t FROM tournaments WHERE id = m.tournament_id FOR UPDATE;
    IF t.status <> 'active' THEN RAISE EXCEPTION 'NOT_ACTIVE'; END IF;
    IF m.status = 'bye' THEN RAISE EXCEPTION 'BYE_MATCH'; END IF;
    IF m.status = 'completed' THEN RAISE EXCEPTION 'ALREADY_COMPLETED'; END IF;
    IF m.entrant1_id IS NULL OR m.entrant2_id IS NULL THEN RAISE EXCEPTION 'MATCH_NOT_READY'; END IF;
    IF COALESCE(p_score1, 0) < 0 OR COALESCE(p_score2, 0) < 0 THEN RAISE EXCEPTION 'INVALID_SCORE'; END IF;
    IF (p_score1 IS NULL) <> (p_score2 IS NULL) THEN RAISE EXCEPTION 'INVALID_SCORE'; END IF;

    IF p_winner IS NOT NULL THEN
        IF p_winner NOT IN (m.entrant1_id, m.entrant2_id) THEN RAISE EXCEPTION 'INVALID_WINNER'; END IF;
        v_winner := p_winner;
        IF NOT p_walkover AND p_score1 IS NOT NULL
           AND ((v_winner = m.entrant1_id AND p_score1 <= p_score2) OR (v_winner = m.entrant2_id AND p_score2 <= p_score1)) THEN
            RAISE EXCEPTION 'SCORE_MISMATCH';
        END IF;
    ELSIF p_score1 IS NOT NULL THEN
        IF p_score1 > p_score2 THEN v_winner := m.entrant1_id;
        ELSIF p_score2 > p_score1 THEN v_winner := m.entrant2_id;
        ELSIF t.tournament_type = 'league' THEN v_winner := NULL;           -- draw
        ELSE RAISE EXCEPTION 'DRAW_NOT_ALLOWED';
        END IF;
    ELSE
        RAISE EXCEPTION 'WINNER_REQUIRED';
    END IF;
    IF p_walkover AND v_winner IS NULL THEN RAISE EXCEPTION 'WINNER_REQUIRED'; END IF;

    UPDATE tournament_matches
    SET score1 = p_score1, score2 = p_score2, winner_id = v_winner, status = 'completed',
        walkover = p_walkover, completed_at = now()
    WHERE id = m.id;

    IF v_winner IS NOT NULL THEN
        v_loser := CASE WHEN v_winner = m.entrant1_id THEN m.entrant2_id ELSE m.entrant1_id END;

        IF m.next_match_id IS NOT NULL THEN
            UPDATE tournament_matches n SET
                entrant1_id = CASE WHEN m.next_slot = 1 THEN v_winner ELSE n.entrant1_id END,
                entrant2_id = CASE WHEN m.next_slot = 2 THEN v_winner ELSE n.entrant2_id END,
                status = CASE WHEN n.status = 'pending'
                               AND (m.next_slot = 1 OR n.entrant1_id IS NOT NULL)
                               AND (m.next_slot = 2 OR n.entrant2_id IS NOT NULL) THEN 'ready' ELSE n.status END
            WHERE n.id = m.next_match_id;
        END IF;

        IF m.loser_next_match_id IS NOT NULL THEN
            UPDATE tournament_matches n SET
                entrant1_id = CASE WHEN m.loser_next_slot = 1 THEN v_loser ELSE n.entrant1_id END,
                entrant2_id = CASE WHEN m.loser_next_slot = 2 THEN v_loser ELSE n.entrant2_id END,
                status = CASE WHEN n.status = 'pending'
                               AND (m.loser_next_slot = 1 OR n.entrant1_id IS NOT NULL)
                               AND (m.loser_next_slot = 2 OR n.entrant2_id IS NOT NULL) THEN 'ready' ELSE n.status END
            WHERE n.id = m.loser_next_match_id;
        END IF;
    END IF;

    SELECT count(*) INTO v_remaining FROM tournament_matches
    WHERE tournament_id = t.id AND status NOT IN ('completed', 'bye');

    IF v_remaining = 0 THEN
        v_completed := true;
        IF t.tournament_type = 'knockout' THEN
            SELECT winner_id INTO v_champion FROM tournament_matches
            WHERE tournament_id = t.id AND bracket = 'main' AND next_match_id IS NULL
            ORDER BY round DESC LIMIT 1;
        END IF;
        UPDATE tournaments SET status = 'completed', completed_at = now(), champion_entrant_id = v_champion WHERE id = t.id;
    END IF;

    RETURN json_build_object(
        'match_id', m.id, 'winner_id', v_winner,
        'tournament_completed', v_completed, 'champion_entrant_id', v_champion
    );
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- undo_match_result: take a result back (wrong button, wrong score). Only while the matches it fed have not
-- started; otherwise undo those first.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION undo_match_result(p_match_id UUID) RETURNS JSON AS $$
DECLARE
    m   tournament_matches%ROWTYPE;
    t   tournaments%ROWTYPE;
    v_status TEXT;
BEGIN
    SELECT * INTO m FROM tournament_matches WHERE id = p_match_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'MATCH_NOT_FOUND'; END IF;
    SELECT * INTO t FROM tournaments WHERE id = m.tournament_id FOR UPDATE;
    IF t.status NOT IN ('active', 'completed') THEN RAISE EXCEPTION 'NOT_ACTIVE'; END IF;
    IF m.status = 'bye' THEN RAISE EXCEPTION 'BYE_MATCH'; END IF;
    IF m.status <> 'completed' THEN RAISE EXCEPTION 'NOT_COMPLETED'; END IF;

    IF m.next_match_id IS NOT NULL THEN
        SELECT status INTO v_status FROM tournament_matches WHERE id = m.next_match_id FOR UPDATE;
        IF v_status IN ('live', 'completed') THEN RAISE EXCEPTION 'NEXT_MATCH_STARTED'; END IF;
    END IF;
    IF m.loser_next_match_id IS NOT NULL THEN
        SELECT status INTO v_status FROM tournament_matches WHERE id = m.loser_next_match_id FOR UPDATE;
        IF v_status IN ('live', 'completed') THEN RAISE EXCEPTION 'NEXT_MATCH_STARTED'; END IF;
    END IF;

    UPDATE tournament_matches
    SET score1 = NULL, score2 = NULL, winner_id = NULL, status = 'ready', walkover = false, completed_at = NULL
    WHERE id = m.id;

    IF m.winner_id IS NOT NULL AND m.next_match_id IS NOT NULL THEN
        UPDATE tournament_matches n SET
            entrant1_id = CASE WHEN m.next_slot = 1 THEN NULL ELSE n.entrant1_id END,
            entrant2_id = CASE WHEN m.next_slot = 2 THEN NULL ELSE n.entrant2_id END,
            status = CASE WHEN n.status = 'ready' THEN 'pending' ELSE n.status END
        WHERE n.id = m.next_match_id;
    END IF;
    IF m.winner_id IS NOT NULL AND m.loser_next_match_id IS NOT NULL THEN
        UPDATE tournament_matches n SET
            entrant1_id = CASE WHEN m.loser_next_slot = 1 THEN NULL ELSE n.entrant1_id END,
            entrant2_id = CASE WHEN m.loser_next_slot = 2 THEN NULL ELSE n.entrant2_id END,
            status = CASE WHEN n.status = 'ready' THEN 'pending' ELSE n.status END
        WHERE n.id = m.loser_next_match_id;
    END IF;

    IF t.status = 'completed' THEN
        UPDATE tournaments SET status = 'active', completed_at = NULL, champion_entrant_id = NULL WHERE id = t.id;
    END IF;

    RETURN json_build_object('match_id', m.id, 'tournament_reopened', t.status = 'completed');
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- record_tournament_view: counts a visitor once per day (IST). Returns the new total.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_tournament_view(p_tournament_id UUID, p_visitor TEXT) RETURNS INTEGER AS $$
DECLARE
    v_total INTEGER;
    v_new   INTEGER;
BEGIN
    IF p_visitor IS NULL OR length(p_visitor) < 8 OR length(p_visitor) > 64 THEN RAISE EXCEPTION 'INVALID_VISITOR'; END IF;
    IF NOT EXISTS (SELECT 1 FROM tournaments WHERE id = p_tournament_id AND status <> 'draft') THEN RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND'; END IF;
    INSERT INTO tournament_views (tournament_id, visitor_id, day)
    VALUES (p_tournament_id, p_visitor, (now() AT TIME ZONE 'Asia/Kolkata')::date)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_new = ROW_COUNT;
    IF v_new > 0 THEN
        UPDATE tournaments SET view_count = view_count + 1 WHERE id = p_tournament_id RETURNING view_count INTO v_total;
    ELSE
        SELECT view_count INTO v_total FROM tournaments WHERE id = p_tournament_id;
    END IF;
    RETURN v_total;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Lock down: only the server (service role) may use these
-- ---------------------------------------------------------------------
DO $$
DECLARE
    obj TEXT;
BEGIN
    FOREACH obj IN ARRAY ARRAY[
        'FUNCTION save_bracket(uuid,jsonb,jsonb)',
        'FUNCTION report_match_result(uuid,integer,integer,uuid,boolean)',
        'FUNCTION undo_match_result(uuid)',
        'FUNCTION record_tournament_view(uuid,text)',
        'TABLE tournament_overview'
    ] LOOP
        EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', obj);
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            EXECUTE format('REVOKE ALL ON %s FROM anon', obj);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE format('REVOKE ALL ON %s FROM authenticated', obj);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
            IF obj LIKE 'FUNCTION%' THEN EXECUTE format('GRANT EXECUTE ON %s TO service_role', obj);
            ELSE EXECUTE format('GRANT SELECT ON %s TO service_role', obj); END IF;
        END IF;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
