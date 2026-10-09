-- Noor Gaming Lab DB setup - tables, foreign keys, indexes
-- Run files in order (01 -> 04) in the Supabase SQL Editor. Safe to re-run.

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
