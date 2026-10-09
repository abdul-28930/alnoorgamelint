-- Noor Gaming Lab DB setup - functions and triggers
-- Run files in order (01 -> 04) in the Supabase SQL Editor. Safe to re-run.

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
