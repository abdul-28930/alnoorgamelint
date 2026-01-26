-- Add discount tracking columns to bookings table
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'NONE';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_value NUMERIC(8,2) DEFAULT 0.00;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS original_amount NUMERIC(8,2) DEFAULT 0.00;



