-- Points System Phase 1
-- Simple points earning and tracking

-- Add points balance to existing user_profiles table
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS points_balance INTEGER DEFAULT 0;

-- Create points transactions table for tracking
CREATE TABLE IF NOT EXISTS points_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    type TEXT CHECK (type IN ('earned', 'redeemed')) NOT NULL,
    points INTEGER NOT NULL,
    description TEXT,
    booking_id UUID REFERENCES bookings(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for points transactions
ALTER TABLE points_transactions ENABLE ROW LEVEL SECURITY;

-- Users can only view their own transactions
CREATE POLICY "Users can view own points transactions" ON points_transactions 
FOR SELECT USING (auth.uid() = user_id);

-- Function to award points for booking payment
CREATE OR REPLACE FUNCTION award_points_for_booking(
    booking_id_param UUID,
    user_id_param UUID,
    amount_paid NUMERIC
) RETURNS INTEGER AS $$
DECLARE
    points_to_award INTEGER;
BEGIN
    -- Calculate points: 1 point per ₹1 spent
    points_to_award := FLOOR(amount_paid)::INTEGER;
    
    -- Update user points balance
    UPDATE user_profiles 
    SET points_balance = points_balance + points_to_award 
    WHERE user_id = user_id_param;
    
    -- Log the transaction
    INSERT INTO points_transactions (user_id, type, points, description, booking_id)
    VALUES (user_id_param, 'earned', points_to_award, 'Earned from booking payment', booking_id_param);
    
    RETURN points_to_award;
END;
$$ LANGUAGE plpgsql; 