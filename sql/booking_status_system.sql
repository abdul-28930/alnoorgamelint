-- Booking Status System Enhancement
-- Run this AFTER enhanced_bookings.sql

-- First, update ALL existing bookings to have proper status values
UPDATE bookings SET status = 
    CASE 
        WHEN cancelled_at IS NOT NULL THEN 'CANCELLED'
        WHEN now() >= end_at THEN 'ENDED'
        WHEN now() >= start_at AND now() < end_at THEN 'ONGOING'
        ELSE 'UPCOMING'
    END;

-- Now add the constraint after data is cleaned
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check 
    CHECK (status IN ('UPCOMING', 'ONGOING', 'ENDED', 'CANCELLED'));

-- Set default status to UPCOMING
ALTER TABLE bookings ALTER COLUMN status SET DEFAULT 'UPCOMING';

-- Create function to auto-update booking status
CREATE OR REPLACE FUNCTION update_booking_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-set status based on time and cancellation
    IF NEW.cancelled_at IS NOT NULL THEN
        NEW.status = 'CANCELLED';
    ELSIF now() >= NEW.end_at THEN
        NEW.status = 'ENDED';
    ELSIF now() >= NEW.start_at AND now() < NEW.end_at THEN
        NEW.status = 'ONGOING';
    ELSE
        NEW.status = 'UPCOMING';
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to auto-update status on insert/update
CREATE TRIGGER auto_update_booking_status
    BEFORE INSERT OR UPDATE ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_booking_status();

-- Create function to bulk update all booking statuses (for scheduled jobs)
CREATE OR REPLACE FUNCTION refresh_all_booking_statuses()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE bookings SET status = 
        CASE 
            WHEN cancelled_at IS NOT NULL THEN 'CANCELLED'
            WHEN now() >= end_at THEN 'ENDED'
            WHEN now() >= start_at AND now() < end_at THEN 'ONGOING'
            ELSE 'UPCOMING'
        END
    WHERE status != CASE 
        WHEN cancelled_at IS NOT NULL THEN 'CANCELLED'
        WHEN now() >= end_at THEN 'ENDED'
        WHEN now() >= start_at AND now() < end_at THEN 'ONGOING'
        ELSE 'UPCOMING'
    END;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ language 'plpgsql';

-- Done! Status system is now database-driven 