-- Create admin_settings table for managing admin access
CREATE TABLE IF NOT EXISTS admin_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    admin_emails TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure only one settings row
    CONSTRAINT single_settings_row CHECK (id = 1)
);

-- Insert default settings (empty admin emails initially)
INSERT INTO admin_settings (id, admin_emails) VALUES (1, '[]') 
ON CONFLICT (id) DO NOTHING;

-- Example of how to add admin emails (uncomment and modify as needed):
-- UPDATE admin_settings SET admin_emails = '["admin@example.com", "owner@alnoorgaming.com"]' WHERE id = 1; 