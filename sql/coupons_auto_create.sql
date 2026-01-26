-- Auto-create first booking coupon for new users
CREATE OR REPLACE FUNCTION create_first_booking_coupon()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO coupons (code, type, discount_percentage, created_for, expires_at)
    VALUES (
        CONCAT('FIRST', substring(NEW.user_id::text, 1, 8)),
        'FIRST_BOOKING',
        30.0,
        NEW.user_id,
        NOW() + INTERVAL '30 days'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on user_profiles creation
CREATE TRIGGER auto_create_first_booking_coupon
    AFTER INSERT ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION create_first_booking_coupon();

-- Function to create referral coupons when referral code is used
CREATE OR REPLACE FUNCTION create_referral_coupons(
    referrer_id UUID,
    referee_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
    -- Create coupon for referrer (person who referred)
    INSERT INTO coupons (code, type, discount_percentage, created_for, created_by, expires_at)
    VALUES (
        CONCAT('REF', substring(gen_random_uuid()::text, 1, 8)),
        'REFERRAL',
        5.0,
        referrer_id,
        referee_id,
        NOW() + INTERVAL '90 days'
    );
    
    -- Create coupon for referee (new user)
    INSERT INTO coupons (code, type, discount_percentage, created_for, created_by, expires_at)
    VALUES (
        CONCAT('REF', substring(gen_random_uuid()::text, 1, 8)),
        'REFERRAL',
        5.0,
        referee_id,
        referrer_id,
        NOW() + INTERVAL '90 days'
    );
    
    -- Update referrer's total referrals
    UPDATE user_profiles 
    SET total_referrals = total_referrals + 1 
    WHERE user_id = referrer_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql; 