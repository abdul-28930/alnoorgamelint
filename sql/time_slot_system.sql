-- Time Slot System Updates
-- Run this to add time slot functionality

-- Add time columns to bookings table
ALTER TABLE bookings 
ADD COLUMN start_time TIME NOT NULL DEFAULT '10:00:00',
ADD COLUMN end_time TIME NOT NULL DEFAULT '11:00:00';

-- Remove the available column from stations (it's misleading)
ALTER TABLE stations DROP COLUMN IF EXISTS available;

-- Update existing bookings to have default time slots
UPDATE bookings 
SET start_time = '10:00:00', end_time = '11:00:00' 
WHERE start_time IS NULL OR end_time IS NULL;

-- Create function to check time slot availability
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

-- Done! Time slot system ready 