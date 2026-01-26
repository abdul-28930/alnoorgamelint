-- Add timer fields to bookings table
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS timer_started_at timestamp with time zone;

ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS timer_total_seconds integer DEFAULT 0;

