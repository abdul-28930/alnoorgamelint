-- Noor Gaming Lab DB setup - approximate end time of a tournament (or of one day of it)
-- Idempotent. Run after 21_tournament_days.sql.
--
-- tournaments.starts_at is when play begins; tournaments.ends_at is when it is expected to finish ("about 6:00 PM"), shown to players.

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;

-- the view was created with t.*, so it has to be rebuilt to include the new column
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

NOTIFY pgrst, 'reload schema';
