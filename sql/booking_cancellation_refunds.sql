-- Add refund tracking columns to bookings table
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(8,2) DEFAULT 0.00;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_fee NUMERIC(8,2) DEFAULT 0.00; 