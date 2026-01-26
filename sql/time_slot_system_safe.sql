-- Time Slot System Updates (Safe Version)
-- This version handles existing columns gracefully

-- Add time columns to bookings table (only if they don't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'start_time') THEN
        ALTER TABLE bookings ADD COLUMN start_time TIME NOT NULL DEFAULT '10:00:00';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'end_time') THEN
        ALTER TABLE bookings ADD COLUMN end_time TIME NOT NULL DEFAULT '11:00:00';
    END IF;
END $$;

-- Remove the available column from stations (if it exists)
ALTER TABLE stations DROP COLUMN IF EXISTS available;

-- Update existing bookings to have default time slots
UPDATE bookings 
SET start_time = '10:00:00', end_time = '11:00:00' 
WHERE start_time IS NULL OR end_time IS NULL;

-- Create or replace the function to check time slot availability
CREATE OR REPLACE FUNCTION get_available_slots(
    station_id_param UUID,
    date_param DATE
) RETURNS TABLE(hour_slot TIME, is_available BOOLEAN) AS $$
BEGIN
    RETURN QUERY
    WITH time_slots AS (
        SELECT (time '10:00:00' + interval '1 hour' * generate_series(0, 11)) AS hour_slot
    ),
    booked_slots AS (
        SELECT start_time, end_time 
        FROM bookings 
        WHERE station_id = station_id_param 
        AND booking_date = date_param
        AND status != 'CANCELLED'
    )
    SELECT 
        ts.hour_slot,
        NOT EXISTS (
            SELECT 1 FROM booked_slots bs 
            WHERE ts.hour_slot >= bs.start_time 
            AND ts.hour_slot < bs.end_time
        ) AS is_available
    FROM time_slots ts
    ORDER BY ts.hour_slot;
END;
$$ LANGUAGE plpgsql;

-- Test the function (optional)
-- SELECT * FROM get_available_slots('45f0a513-548d-408b-9a45-cadc9d9318fc', '2024-01-15');

-- Done! Time slot system ready 