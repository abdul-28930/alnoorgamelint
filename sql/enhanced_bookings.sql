-- Enhanced Gaming Centre Bookings
-- Run this AFTER enhanced_stations.sql

-- Add useful columns to bookings table
ALTER TABLE bookings ADD COLUMN total_amount NUMERIC(8,2) DEFAULT 0.00;
ALTER TABLE bookings ADD COLUMN duration_hours INTEGER DEFAULT 1;
ALTER TABLE bookings ADD COLUMN booking_notes TEXT DEFAULT NULL;
ALTER TABLE bookings ADD COLUMN payment_method TEXT DEFAULT NULL;
ALTER TABLE bookings ADD COLUMN cancelled_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE bookings ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_bookings_updated_at 
    BEFORE UPDATE ON bookings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add some sample bookings for testing
INSERT INTO bookings (user_id, station_id, start_at, end_at, total_amount, duration_hours, status) 
SELECT 
    (SELECT id FROM auth.users LIMIT 1),
    s.id,
    now() + interval '1 day',
    now() + interval '1 day' + interval '2 hours',
    s.hourly_rate * 2,
    2,
    'CONFIRMED'
FROM stations s 
WHERE s.name = 'Night City PS5 Alpha'
LIMIT 1;

-- Done! Enhanced bookings table ready 