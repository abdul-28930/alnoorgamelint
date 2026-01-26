-- Station Check-in System
-- Add check-in fields to bookings table

-- Add checked_in_at timestamp
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS checked_in_at timestamp with time zone;

-- Add checked_in boolean for quick filtering
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS checked_in boolean DEFAULT false;

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_bookings_checked_in ON bookings(checked_in_at);
CREATE INDEX IF NOT EXISTS idx_bookings_station_date ON bookings(station_id, start_at) WHERE status != 'CANCELLED';

-- Update existing bookings based on checked_in_at
UPDATE bookings SET checked_in = (checked_in_at IS NOT NULL) WHERE checked_in IS NULL;

-- Done!






