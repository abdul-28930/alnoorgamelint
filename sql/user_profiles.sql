-- User Profiles System
-- Run this AFTER booking_status_system.sql

-- Create user profiles table
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    profile_pic_url TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_user_profiles_updated_at 
    BEFORE UPDATE ON user_profiles 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to check if username is available
CREATE OR REPLACE FUNCTION is_username_available(check_username TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN NOT EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE LOWER(username) = LOWER(check_username)
    );
END;
$$ language 'plpgsql';

-- Create function to get user profile by user_id
CREATE OR REPLACE FUNCTION get_user_profile(auth_user_id UUID)
RETURNS TABLE (
    username TEXT,
    full_name TEXT,
    profile_pic_url TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT up.username, up.full_name, up.profile_pic_url, up.created_at
    FROM user_profiles up
    WHERE up.user_id = auth_user_id;
END;
$$ language 'plpgsql';

-- Add RLS policies for user profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can only view and edit their own profile
CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = user_id);

-- Done! User profiles system ready 