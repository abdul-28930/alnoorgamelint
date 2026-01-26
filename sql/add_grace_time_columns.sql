-- Add grace time tracking columns to bookings table
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS grace_time_started_at TIMESTAMP NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS auto_extended_hours INTEGER DEFAULT 0;



