-- Noor Gaming Lab DB setup - row level security and storage bucket
-- Run files in order (01 -> 04) in the Supabase SQL Editor. Safe to re-run.

-- ---------------------------------------------------------------------
-- 4. Row Level Security
-- (the FastAPI backend uses the service-role key, which bypasses RLS;
--  these policies protect the direct browser/anon-key queries)
-- ---------------------------------------------------------------------
ALTER TABLE stations                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE charges_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE prepaid_plans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_prepaid_cards       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_rewards           ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_registrations ENABLE ROW LEVEL SECURITY;

-- stations: public read, admin write (frontend manages stations directly)
DROP POLICY IF EXISTS "stations_read"  ON stations;
DROP POLICY IF EXISTS "stations_admin" ON stations;
CREATE POLICY "stations_read"  ON stations FOR SELECT USING (true);
CREATE POLICY "stations_admin" ON stations FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- user_profiles: own row (admins can read all)
DROP POLICY IF EXISTS "own_profile_select" ON user_profiles;
DROP POLICY IF EXISTS "own_profile_insert" ON user_profiles;
DROP POLICY IF EXISTS "own_profile_update" ON user_profiles;
CREATE POLICY "own_profile_select" ON user_profiles FOR SELECT USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "own_profile_insert" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_profile_update" ON user_profiles FOR UPDATE USING (auth.uid() = user_id OR is_admin());

-- user_roles: read own role
DROP POLICY IF EXISTS "own_role_select" ON user_roles;
CREATE POLICY "own_role_select" ON user_roles FOR SELECT USING (auth.uid() = user_id OR is_admin());

-- admin_settings: any signed-in user can read (frontend admin-guard checks the
-- email list client-side); only admins can change it.
DROP POLICY IF EXISTS "admin_settings_read"  ON admin_settings;
DROP POLICY IF EXISTS "admin_settings_write" ON admin_settings;
CREATE POLICY "admin_settings_read"  ON admin_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_settings_write" ON admin_settings FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- charges_items / prepaid_plans / points_rewards: public read of active rows
DROP POLICY IF EXISTS "charges_items_read" ON charges_items;
CREATE POLICY "charges_items_read" ON charges_items FOR SELECT USING (active = true OR is_admin());
DROP POLICY IF EXISTS "prepaid_plans_read" ON prepaid_plans;
CREATE POLICY "prepaid_plans_read" ON prepaid_plans FOR SELECT USING (active = true OR is_admin());
DROP POLICY IF EXISTS "Rewards are publicly readable" ON points_rewards;
CREATE POLICY "Rewards are publicly readable" ON points_rewards FOR SELECT USING (active = true OR is_admin());

-- own-data tables
DROP POLICY IF EXISTS "own_bookings_select" ON bookings;
CREATE POLICY "own_bookings_select" ON bookings FOR SELECT USING (auth.uid() = user_id OR is_admin());
DROP POLICY IF EXISTS "own_cards_select" ON user_prepaid_cards;
CREATE POLICY "own_cards_select" ON user_prepaid_cards FOR SELECT USING (auth.uid() = user_id OR is_admin());
DROP POLICY IF EXISTS "own_coupons_select" ON coupons;
CREATE POLICY "own_coupons_select" ON coupons FOR SELECT USING (auth.uid() = created_for OR is_admin());
DROP POLICY IF EXISTS "Users can view own points transactions" ON points_transactions;
CREATE POLICY "Users can view own points transactions" ON points_transactions
    FOR SELECT USING (auth.uid() = user_id OR is_admin());

-- tournaments: public read; users register themselves
DROP POLICY IF EXISTS "Tournaments are publicly readable" ON tournaments;
CREATE POLICY "Tournaments are publicly readable" ON tournaments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can view own registrations" ON tournament_registrations;
DROP POLICY IF EXISTS "Users can register themselves"    ON tournament_registrations;
CREATE POLICY "Users can view own registrations" ON tournament_registrations
    FOR SELECT USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "Users can register themselves" ON tournament_registrations
    FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ---------------------------------------------------------------------
-- 5. Storage bucket for profile pictures
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-pictures', 'profile-pictures', true, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload their own profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Profile pictures are publicly viewable"      ON storage.objects;

CREATE POLICY "Users can upload their own profile pictures" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'profile-pictures' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update their own profile pictures" ON storage.objects
    FOR UPDATE USING (bucket_id = 'profile-pictures' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own profile pictures" ON storage.objects
    FOR DELETE USING (bucket_id = 'profile-pictures' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Profile pictures are publicly viewable" ON storage.objects
    FOR SELECT USING (bucket_id = 'profile-pictures');
