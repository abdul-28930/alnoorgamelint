-- Add total playtime tracking to user profiles
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS total_playtime_seconds INTEGER DEFAULT 0;



