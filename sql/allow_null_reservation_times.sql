-- Allow null values for start_time and end_time (for reservations)
ALTER TABLE bookings ALTER COLUMN start_time DROP NOT NULL;
ALTER TABLE bookings ALTER COLUMN end_time DROP NOT NULL;

-- Clear existing times for reservations (advance_paid = true)
UPDATE bookings 
SET start_time = NULL, end_time = NULL 
WHERE advance_paid = true AND start_time IS NOT NULL;





