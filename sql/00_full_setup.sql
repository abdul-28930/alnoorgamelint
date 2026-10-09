-- =====================================================================
-- Noor Gaming Lab - FULL DATABASE SETUP (single script)
-- Rebuilds the whole Supabase schema from scratch on a NEW project.
--
-- How to run: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE / DROP IF EXISTS).
--
-- Consolidated from: fullschema.json (live column dump) + all sql/*.sql
-- migrations + columns/RPCs/tables actually used by backend/ and frontend/.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Core tables
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    type         TEXT CHECK (type IN ('PS5', 'PC')),
    hourly_rate  NUMERIC(8,2) NOT NULL,
    active       BOOLEAN DEFAULT true,
    created_at   TIMESTAMPTZ DEFAULT now(),
    description  TEXT DEFAULT 'Gaming station with premium setup',
    features     JSONB DEFAULT '[]'::jsonb,
    image_url    TEXT
);

CREATE TABLE IF NOT EXISTS user_profiles (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    username                TEXT NOT NULL UNIQUE,
    full_name               TEXT NOT NULL,
    profile_pic_url         TEXT,
    created_at              TIMESTAMPTZ DEFAULT now(),
    updated_at              TIMESTAMPTZ DEFAULT now(),
    phone                   VARCHAR(20),
    referral_code           TEXT DEFAULT concat('REF', substring(gen_random_uuid()::text, 1, 8)),
    total_referrals         INTEGER DEFAULT 0,
    points_balance          INTEGER DEFAULT 0,
    total_playtime_seconds  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role        TEXT DEFAULT 'user',          -- 'user' | 'staff' | 'admin'
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Single-row settings table (admin emails list)
CREATE TABLE IF NOT EXISTS admin_settings (
    id            INTEGER PRIMARY KEY DEFAULT 1,
    admin_emails  TEXT NOT NULL DEFAULT '[]',   -- JSON array stored as text
    food_items    TEXT DEFAULT '[]',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT single_settings_row CHECK (id = 1)
);

-- Food / beverage price list (used by admin "food items")
CREATE TABLE IF NOT EXISTS charges_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL UNIQUE,
    price       NUMERIC(10,2) NOT NULL DEFAULT 0,
    active      BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Prepaid plans and user prepaid balances
CREATE TABLE IF NOT EXISTS prepaid_plans (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    price       NUMERIC(10,2) NOT NULL,
    minutes     INTEGER NOT NULL,
    active      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_prepaid_cards (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id            UUID NOT NULL REFERENCES prepaid_plans(id),
    total_minutes      INTEGER NOT NULL,
    remaining_minutes  INTEGER NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NOTE: start_at / end_at are TEXT ("YYYY-MM-DD HH:MM:SS", IST wall-clock).
-- The backend builds and compares them as strings, so keep them TEXT.
CREATE TABLE IF NOT EXISTS bookings (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL,
    station_id              UUID,
    start_at                TEXT NOT NULL,
    end_at                  TEXT NOT NULL,
    paid                    BOOLEAN DEFAULT false,
    status                  TEXT DEFAULT 'UPCOMING',
    created_at              TIMESTAMPTZ DEFAULT now(),
    updated_at              TIMESTAMPTZ DEFAULT now(),
    total_amount            NUMERIC(8,2) DEFAULT 0.00,
    duration_hours          INTEGER DEFAULT 1,
    booking_notes           TEXT,
    payment_method          TEXT,
    cancelled_at            TIMESTAMPTZ,
    start_time              TIME DEFAULT '10:00:00',   -- nullable: advance-paid reservations have no time
    end_time                TIME DEFAULT '11:00:00',
    user_count              INTEGER DEFAULT 1,
    reminder_1h_sent        BOOLEAN DEFAULT false,
    reminder_30m_sent       BOOLEAN DEFAULT false,
    reminder_5m_sent        BOOLEAN DEFAULT false,
    -- payments
    advance_amount          NUMERIC(8,2) DEFAULT 0.00,
    advance_paid            BOOLEAN DEFAULT false,
    advance_payment_method  TEXT,
    payment_status          TEXT DEFAULT 'UNPAID',
    remaining_amount        NUMERIC(8,2) DEFAULT 0.00,
    amount_paid             NUMERIC DEFAULT 0,
    -- food
    food_items              JSON DEFAULT '[]'::json,
    food_total              NUMERIC(8,2) DEFAULT 0.00,
    -- cancellation
    refund_amount           NUMERIC(8,2) DEFAULT 0.00,
    cancellation_fee        NUMERIC(8,2) DEFAULT 0.00,
    -- coupons / discounts
    coupon_code             TEXT,
    coupon_discount         NUMERIC(10,2) DEFAULT 0,
    discount_type           TEXT DEFAULT 'NONE',
    discount_value          NUMERIC(8,2) DEFAULT 0.00,
    original_amount         NUMERIC(8,2) DEFAULT 0.00,
    custom_hourly_rate      NUMERIC(8,2),
    hourly_rate             NUMERIC(8,2),              -- optional per-booking override (admin edit)
    -- check-in & live timer
    checked_in              BOOLEAN DEFAULT false,
    checked_in_at           TIMESTAMPTZ,
    timer_started_at        TIMESTAMPTZ,
    timer_total_seconds     INTEGER DEFAULT 0,
    grace_time_started_at   TIMESTAMP,
    auto_extended_hours     INTEGER DEFAULT 0,
    -- prepaid
    billing_type            TEXT DEFAULT 'POSTPAID',
    prepaid_card_id         UUID,
    prepaid_minutes_used    INTEGER DEFAULT 0,
    -- staff who handled the booking
    staff_id                UUID
);

-- Foreign keys (named: the backend embeds "user_profiles!bookings_user_fk(...)")
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_user_fk') THEN
        ALTER TABLE bookings ADD CONSTRAINT bookings_user_fk
            FOREIGN KEY (user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_station_fk') THEN
        ALTER TABLE bookings ADD CONSTRAINT bookings_station_fk
            FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_staff_fk') THEN
        ALTER TABLE bookings ADD CONSTRAINT bookings_staff_fk
            FOREIGN KEY (staff_id) REFERENCES user_profiles(user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_prepaid_card_fk') THEN
        ALTER TABLE bookings ADD CONSTRAINT bookings_prepaid_card_fk
            FOREIGN KEY (prepaid_card_id) REFERENCES user_prepaid_cards(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_status_check') THEN
        ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
            CHECK (status IN ('UPCOMING', 'ONGOING', 'ENDED', 'CANCELLED'));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS coupons (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                 TEXT NOT NULL UNIQUE,
    type                 TEXT,       -- FIRST_BOOKING | REFERRAL | POINTS_REWARD | ...
    discount_percentage  NUMERIC NOT NULL,
    created_by           UUID,
    created_for          UUID,
    used_by              UUID,
    used_at              TIMESTAMPTZ,
    expires_at           TIMESTAMPTZ,
    is_active            BOOLEAN DEFAULT true,
    created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS points_rewards (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 TEXT NOT NULL,
    points_cost          INTEGER NOT NULL,
    discount_percentage  NUMERIC(5,2) NOT NULL,
    description          TEXT DEFAULT '',
    active               BOOLEAN DEFAULT true,
    created_at           TIMESTAMPTZ DEFAULT now()
);

-- user_id references user_profiles so PostgREST can embed user_profiles(username)
CREATE TABLE IF NOT EXISTS points_transactions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK (type IN ('earned', 'redeemed')),
    points      INTEGER NOT NULL,
    description TEXT,
    booking_id  UUID REFERENCES bookings(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournaments (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT NOT NULL,
    game             TEXT NOT NULL,
    platform         TEXT NOT NULL CHECK (platform IN ('PC', 'PS5')),
    max_players      INTEGER NOT NULL,
    tournament_type  TEXT NOT NULL CHECK (tournament_type IN ('knockout', 'league')),
    status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'open', 'paused', 'active', 'completed')),
    banner_image     TEXT,
    description      TEXT,
    created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournament_registrations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id  UUID REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    registered_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (tournament_id, user_id)
);


-- ---------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bookings_user          ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_checked_in    ON bookings(checked_in_at);
CREATE INDEX IF NOT EXISTS idx_bookings_station_date  ON bookings(station_id, start_at) WHERE status != 'CANCELLED';
CREATE INDEX IF NOT EXISTS idx_coupons_created_for    ON coupons(created_for);
CREATE INDEX IF NOT EXISTS idx_points_tx_user         ON points_transactions(user_id);


-- ---------------------------------------------------------------------
-- 3. Functions & triggers
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_bookings_updated_at ON bookings;
CREATE TRIGGER update_bookings_updated_at
    BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Username availability (called by backend signup/login)
CREATE OR REPLACE FUNCTION is_username_available(check_username TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN NOT EXISTS (SELECT 1 FROM user_profiles WHERE LOWER(username) = LOWER(check_username));
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_user_profile(auth_user_id UUID)
RETURNS TABLE (username TEXT, full_name TEXT, profile_pic_url TEXT, created_at TIMESTAMPTZ) AS $$
BEGIN
    RETURN QUERY
    SELECT up.username, up.full_name, up.profile_pic_url, up.created_at
    FROM user_profiles up WHERE up.user_id = auth_user_id;
END;
$$ LANGUAGE plpgsql;

-- 24-hour slot availability for a station on a date (start_at is text, cast for DATE)
CREATE OR REPLACE FUNCTION get_available_slots(station_id_param UUID, date_param DATE)
RETURNS TABLE(hour_slot TIME, is_available BOOLEAN) AS $$
BEGIN
    RETURN QUERY
    WITH time_slots AS (
        SELECT (time '00:00:00' + interval '1 hour' * generate_series(0, 23))::time AS hour_slot
    ),
    booked_slots AS (
        SELECT b.start_time, b.end_time
        FROM bookings b
        WHERE b.station_id = station_id_param
          AND b.start_at::date = date_param
          AND b.status != 'CANCELLED'
          AND b.start_time IS NOT NULL
    )
    SELECT ts.hour_slot,
           NOT EXISTS (
               SELECT 1 FROM booked_slots bs
               WHERE ts.hour_slot >= bs.start_time AND ts.hour_slot < bs.end_time
           ) AS is_available
    FROM time_slots ts
    ORDER BY ts.hour_slot;
END;
$$ LANGUAGE plpgsql;

-- 30% first-booking coupon for every new profile
CREATE OR REPLACE FUNCTION create_first_booking_coupon()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO coupons (code, type, discount_percentage, created_for, expires_at)
    VALUES (CONCAT('FIRST', substring(NEW.user_id::text, 1, 8)), 'FIRST_BOOKING', 30.0,
            NEW.user_id, NOW() + INTERVAL '30 days')
    ON CONFLICT (code) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_create_first_booking_coupon ON user_profiles;
CREATE TRIGGER auto_create_first_booking_coupon
    AFTER INSERT ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION create_first_booking_coupon();

-- Referral: 5% coupon for both users, bump referrer count
CREATE OR REPLACE FUNCTION create_referral_coupons(referrer_id UUID, referee_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    INSERT INTO coupons (code, type, discount_percentage, created_for, created_by, expires_at)
    VALUES (CONCAT('REF', substring(gen_random_uuid()::text, 1, 8)), 'REFERRAL', 5.0,
            referrer_id, referee_id, NOW() + INTERVAL '90 days');

    INSERT INTO coupons (code, type, discount_percentage, created_for, created_by, expires_at)
    VALUES (CONCAT('REF', substring(gen_random_uuid()::text, 1, 8)), 'REFERRAL', 5.0,
            referee_id, referrer_id, NOW() + INTERVAL '90 days');

    UPDATE user_profiles SET total_referrals = COALESCE(total_referrals, 0) + 1
    WHERE user_id = referrer_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 1 point per rupee paid
CREATE OR REPLACE FUNCTION award_points_for_booking(
    booking_id_param UUID, user_id_param UUID, amount_paid NUMERIC
) RETURNS INTEGER AS $$
DECLARE
    points_to_award INTEGER;
BEGIN
    points_to_award := FLOOR(amount_paid)::INTEGER;

    UPDATE user_profiles
    SET points_balance = COALESCE(points_balance, 0) + points_to_award
    WHERE user_id = user_id_param;

    INSERT INTO points_transactions (user_id, type, points, description, booking_id)
    VALUES (user_id_param, 'earned', points_to_award, 'Earned from booking payment', booking_id_param);

    RETURN points_to_award;
END;
$$ LANGUAGE plpgsql;

-- Redeem points for a discount coupon
CREATE OR REPLACE FUNCTION redeem_points_for_reward(user_id_param UUID, reward_id_param UUID)
RETURNS JSON AS $$
DECLARE
    user_balance INTEGER;
    reward_data  RECORD;
    coupon_code  TEXT;
BEGIN
    SELECT points_balance INTO user_balance FROM user_profiles WHERE user_id = user_id_param;

    SELECT * INTO reward_data FROM points_rewards WHERE id = reward_id_param AND active = true;
    IF NOT FOUND THEN
        RETURN '{"success": false, "error": "Reward not found"}'::JSON;
    END IF;

    IF COALESCE(user_balance, 0) < reward_data.points_cost THEN
        RETURN '{"success": false, "error": "Insufficient points"}'::JSON;
    END IF;

    coupon_code := 'POINTS' || UPPER(substring(gen_random_uuid()::text, 1, 8));

    UPDATE user_profiles
    SET points_balance = points_balance - reward_data.points_cost
    WHERE user_id = user_id_param;

    INSERT INTO points_transactions (user_id, type, points, description)
    VALUES (user_id_param, 'redeemed', -reward_data.points_cost, 'Redeemed for ' || reward_data.name);

    INSERT INTO coupons (code, type, discount_percentage, created_for, expires_at, is_active)
    VALUES (coupon_code, 'POINTS_REWARD', reward_data.discount_percentage,
            user_id_param, NOW() + INTERVAL '30 days', true);

    RETURN json_build_object(
        'success', true,
        'coupon_code', coupon_code,
        'points_deducted', reward_data.points_cost,
        'discount_percentage', reward_data.discount_percentage
    );
END;
$$ LANGUAGE plpgsql;

-- Helper for RLS: is the current JWT user an admin?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
        OR EXISTS (
            SELECT 1 FROM admin_settings s
            WHERE s.admin_emails::jsonb ? (auth.jwt() ->> 'email')
        );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;


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


-- ---------------------------------------------------------------------
-- 6. Seed data
-- ---------------------------------------------------------------------

-- Single settings row. >>> PUT YOUR ADMIN EMAIL(S) HERE <<<
INSERT INTO admin_settings (id, admin_emails, food_items)
VALUES (1, '["your-admin-email@example.com"]', '[]')
ON CONFLICT (id) DO NOTHING;

-- Stations (cyberpunk set from enhanced_stations.sql). Skip if already seeded.
INSERT INTO stations (name, type, hourly_rate, description, features, image_url, active)
SELECT * FROM (VALUES
 ('Night City PS5 Alpha', 'PS5', 150.00, 'Dive into Night City with this premium PS5 setup featuring 4K HDR gaming and haptic feedback.',
  '["PlayStation 5 Console","4K HDR Gaming","DualSense Haptic Controller","Premium Gaming Headset","Cyberpunk 2077 Pre-installed"]'::jsonb,
  'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=400&h=300&fit=crop', true),
 ('Edgerunners PS5 Beta', 'PS5', 150.00, 'Experience the world of Edgerunners with exclusive anime-themed setup and surround sound.',
  '["PlayStation 5 Console","7.1 Surround Sound","Anime Game Collection","Racing Wheel Support","RGB Lighting"]'::jsonb,
  'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400&h=300&fit=crop', true),
 ('Corpo PC Rig Neo', 'PC', 120.00, 'High-end corporate-grade gaming PC with RTX 4080 for the ultimate cyberpunk experience.',
  '["RTX 4080 Graphics","32GB RAM","Mechanical RGB Keyboard","144Hz Monitor","Cyberpunk Game Library"]'::jsonb,
  'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=400&h=300&fit=crop', true),
 ('Netrunner PC Matrix', 'PC', 140.00, 'Ultra-performance netrunner setup with RTX 4090 and curved ultrawide for immersive hacking.',
  '["RTX 4090 Graphics","64GB RAM","Curved Ultrawide Monitor","Neon RGB Setup","Streaming Ready"]'::jsonb,
  'https://images.unsplash.com/photo-1593640495253-23196b27a87f?w=400&h=300&fit=crop', true),
 ('Arasaka PS5 Gamma', 'PS5', 160.00, 'Elite Arasaka-themed PS5 station with PSVR2 support and premium accessories.',
  '["PlayStation 5 Console","PSVR2 Support","Premium Accessories","Climate Control","Exclusive Games"]'::jsonb,
  'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=400&h=300&fit=crop', true),
 ('Militech PC Cyber', 'PC', 130.00, 'Military-grade gaming setup with liquid cooling and tactical peripherals.',
  '["RTX 4080 Graphics","Liquid Cooling","Tactical Peripherals","Dual 27\" Monitors","VR Ready"]'::jsonb,
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&h=300&fit=crop', true),
 ('Valentino PS5 Delta', 'PS5', 155.00, 'Street-style PS5 setup with custom neon lighting and premium sound system.',
  '["PlayStation 5 Console","Custom Neon Lighting","Premium Sound System","Street Racing Games","Comfortable Gaming Chair"]'::jsonb,
  'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=400&h=300&fit=crop', false),
 ('Maelstrom PC Chaos', 'PC', 125.00, 'Chaotic high-performance rig with aggressive cooling and punk aesthetics.',
  '["RTX 4070 Graphics","Aggressive Cooling","Punk RGB Lighting","Gaming Mechanical Keyboard","High-DPI Gaming Mouse"]'::jsonb,
  'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=400&h=300&fit=crop', true),
 ('Afterlife PS5 Omega', 'PS5', 165.00, 'Legendary Afterlife bar themed PS5 with exclusive content and premium setup.',
  '["PlayStation 5 Console","Exclusive Content","Premium Gaming Setup","Afterlife Theme","Professional Gaming Chair"]'::jsonb,
  'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400&h=300&fit=crop', true),
 ('Rogue PC Terminal', 'PC', 135.00, 'Rogue-class gaming terminal with stealth setup and advanced peripherals.',
  '["RTX 4080 Graphics","Stealth Black Setup","Advanced Peripherals","Triple Monitor Setup","Noise Cancelling Headset"]'::jsonb,
  'https://images.unsplash.com/photo-1593640495253-23196b27a87f?w=400&h=300&fit=crop', true)
) AS v(name, type, hourly_rate, description, features, image_url, active)
WHERE NOT EXISTS (SELECT 1 FROM stations);

-- Points rewards catalogue
INSERT INTO points_rewards (name, points_cost, discount_percentage, description)
SELECT * FROM (VALUES
 ('₹5 Discount Coupon',  500,  5.0,  '5% off your next booking'),
 ('₹10 Discount Coupon', 1000, 10.0, '10% off your next booking'),
 ('₹25 Discount Coupon', 2500, 25.0, '25% off your next booking'),
 ('₹50 Discount Coupon', 5000, 50.0, '50% off your next booking')
) AS v(name, points_cost, discount_percentage, description)
WHERE NOT EXISTS (SELECT 1 FROM points_rewards);

-- Ask PostgREST to pick up the new schema immediately
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- DONE. After running:
--   1. Replace the admin email above (or: UPDATE admin_settings SET admin_emails='["you@x.com"]' WHERE id=1;)
--   2. Sign up once through the app, then optionally promote yourself:
--        INSERT INTO user_roles (user_id, role) VALUES ('<your auth.users id>', 'admin')
--        ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
-- =====================================================================
