-- Just create the get_available_slots function
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