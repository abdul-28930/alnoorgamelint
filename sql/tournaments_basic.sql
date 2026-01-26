-- Basic Tournament System
-- Simple tournament tables for gaming center

-- Create tournaments table
CREATE TABLE tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    game TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('PC', 'PS5')),
    max_players INTEGER NOT NULL,
    tournament_type TEXT NOT NULL CHECK (tournament_type IN ('knockout', 'league')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'paused', 'active', 'completed')),
    banner_image TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create tournament registrations table
CREATE TABLE tournament_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tournament_id, user_id)
);

-- Enable RLS
ALTER TABLE tournaments DISABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_registrations DISABLE ROW LEVEL SECURITY;

-- RLS policies - tournaments are publicly readable
CREATE POLICY "Tournaments are publicly readable" ON tournaments FOR SELECT USING (true);

-- Users can view their own registrations
CREATE POLICY "Users can view own registrations" ON tournament_registrations 
FOR SELECT USING (auth.uid() = user_id);

-- Users can register themselves
CREATE POLICY "Users can register themselves" ON tournament_registrations 
FOR INSERT WITH CHECK (auth.uid() = user_id); 