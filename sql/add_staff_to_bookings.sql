-- Add staff_id column to bookings table
ALTER TABLE bookings ADD COLUMN staff_id uuid REFERENCES user_profiles(user_id);

