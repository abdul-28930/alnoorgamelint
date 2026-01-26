-- Add food_items column to admin_settings table
ALTER TABLE admin_settings 
ADD COLUMN IF NOT EXISTS food_items TEXT DEFAULT '[]';

-- Initialize with empty array if null
UPDATE admin_settings 
SET food_items = '[]' 
WHERE food_items IS NULL;





