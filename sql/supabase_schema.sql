-- Simple Gaming Centre Database Schema
-- Run this in Supabase SQL Editor

-- Create stations table
create table stations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    type text check (type in ('PS5','PC')),
    hourly_rate numeric(8,2) not null,
    active boolean default true,
    created_at timestamptz default now()
);

-- Create bookings table
create table bookings (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users not null,
    station_id uuid references stations on delete cascade,
    start_at timestamptz not null,
    end_at timestamptz not null,
    paid boolean default false,
    status text default 'CONFIRMED',
    created_at timestamptz default now()
);

-- Create user roles table
create table user_roles (
    user_id uuid references auth.users primary key,
    role text default 'user',
    created_at timestamptz default now()
);

-- Insert sample stations
insert into stations (name, type, hourly_rate) values
('PS5 Station 1', 'PS5', 150.00),
('PS5 Station 2', 'PS5', 150.00),
('PC Gaming Rig 1', 'PC', 120.00),
('PC Gaming Rig 2', 'PC', 120.00);

-- Done! 