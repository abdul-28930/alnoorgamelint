-- Add custom hourly rate column to bookings table
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS custom_hourly_rate NUMERIC(8,2) DEFAULT NULL;