-- Essential Authentication System - Safe Update

-- Create table only if it doesn't exist
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Username availability check
CREATE OR REPLACE FUNCTION is_username_available(check_username TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN NOT EXISTS (SELECT 1 FROM user_profiles WHERE LOWER(username) = LOWER(check_username));
END;
$$ LANGUAGE plpgsql;

-- Enable security (safe)
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_profile_select" ON user_profiles;
DROP POLICY IF EXISTS "own_profile_insert" ON user_profiles;
DROP POLICY IF EXISTS "own_profile_update" ON user_profiles;

CREATE POLICY "own_profile_select" ON user_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_profile_insert" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_profile_update" ON user_profiles FOR UPDATE USING (auth.uid() = user_id); 