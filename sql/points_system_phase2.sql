-- Points System Phase 2 - Rewards and Redemption
-- Simple rewards catalog and redemption system

-- Create points rewards table
CREATE TABLE IF NOT EXISTS points_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    points_cost INTEGER NOT NULL,
    discount_percentage NUMERIC(5,2) NOT NULL,
    description TEXT DEFAULT '',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for rewards (publicly readable)
ALTER TABLE points_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Rewards are publicly readable" ON points_rewards FOR SELECT USING (active = true);

-- Insert sample rewards
INSERT INTO points_rewards (name, points_cost, discount_percentage, description) VALUES
('₹5 Discount Coupon', 500, 5.0, '5% off your next booking'),
('₹10 Discount Coupon', 1000, 10.0, '10% off your next booking'),
('₹25 Discount Coupon', 2500, 25.0, '25% off your next booking'),
('₹50 Discount Coupon', 5000, 50.0, '50% off your next booking')
ON CONFLICT DO NOTHING;

-- Function to redeem points for reward
CREATE OR REPLACE FUNCTION redeem_points_for_reward(
    user_id_param UUID,
    reward_id_param UUID
) RETURNS JSON AS $$
DECLARE
    user_balance INTEGER;
    reward_cost INTEGER;
    reward_data RECORD;
    coupon_code TEXT;
    result JSON;
BEGIN
    -- Get user's current points balance
    SELECT points_balance INTO user_balance 
    FROM user_profiles WHERE user_id = user_id_param;
    
    -- Get reward details
    SELECT * INTO reward_data 
    FROM points_rewards WHERE id = reward_id_param AND active = true;
    
    IF NOT FOUND THEN
        RETURN '{"success": false, "error": "Reward not found"}'::JSON;
    END IF;
    
    reward_cost := reward_data.points_cost;
    
    -- Check if user has enough points
    IF user_balance < reward_cost THEN
        RETURN '{"success": false, "error": "Insufficient points"}'::JSON;
    END IF;
    
    -- Generate coupon code
    coupon_code := 'POINTS' || UPPER(substring(gen_random_uuid()::text, 1, 8));
    
    -- Deduct points from user
    UPDATE user_profiles 
    SET points_balance = points_balance - reward_cost 
    WHERE user_id = user_id_param;
    
    -- Log redemption transaction
    INSERT INTO points_transactions (user_id, type, points, description)
    VALUES (user_id_param, 'redeemed', -reward_cost, 'Redeemed for ' || reward_data.name);
    
    -- Create discount coupon
    INSERT INTO coupons (code, type, discount_percentage, created_for, expires_at, is_active)
    VALUES (
        coupon_code, 
        'POINTS_REWARD', 
        reward_data.discount_percentage, 
        user_id_param, 
        NOW() + INTERVAL '30 days',
        true
    );
    
    result := json_build_object(
        'success', true,
        'coupon_code', coupon_code,
        'points_deducted', reward_cost,
        'discount_percentage', reward_data.discount_percentage
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql; 