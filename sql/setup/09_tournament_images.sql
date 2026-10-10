-- Noor Gaming Lab DB setup - tournament poster and banner images
-- Idempotent. Run after 08_tournaments.sql.
--
-- The API (service role) uploads the files; the bucket is public so the images can be shown and shared.
-- No write policies are created, so browsers cannot upload or delete anything directly.

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS poster_image TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tournament-images', 'tournament-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "Tournament images are publicly viewable" ON storage.objects;
CREATE POLICY "Tournament images are publicly viewable" ON storage.objects
    FOR SELECT USING (bucket_id = 'tournament-images');

-- the view was created with t.* before poster_image existed, so it must be rebuilt to include it
DROP VIEW IF EXISTS tournament_overview;
CREATE VIEW tournament_overview AS
SELECT t.*,
       (SELECT count(*) FROM tournament_entrants e
         WHERE e.tournament_id = t.id AND e.status IN ('registered', 'checked_in'))::int AS registered_count,
       (SELECT count(*) FROM tournament_entrants e
         WHERE e.tournament_id = t.id AND e.status = 'waitlist')::int                    AS waitlist_count
FROM tournaments t;

-- same lock-down as 08: the view is for the server only
DO $$
BEGIN
    REVOKE ALL ON tournament_overview FROM PUBLIC;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON tournament_overview FROM anon; END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON tournament_overview FROM authenticated; END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN GRANT SELECT ON tournament_overview TO service_role; END IF;
END $$;

NOTIFY pgrst, 'reload schema';
