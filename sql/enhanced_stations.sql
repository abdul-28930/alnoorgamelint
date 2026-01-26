-- Enhanced Gaming Centre Stations
-- Run this AFTER the initial schema

-- Add new columns to stations table
ALTER TABLE stations ADD COLUMN description TEXT DEFAULT 'Gaming station with premium setup';
ALTER TABLE stations ADD COLUMN features JSONB DEFAULT '[]';
ALTER TABLE stations ADD COLUMN image_url TEXT DEFAULT NULL;
ALTER TABLE stations ADD COLUMN available BOOLEAN DEFAULT true;

-- Update existing stations with cyberpunk theme
UPDATE stations SET 
    name = 'Night City PS5 Alpha',
    description = 'Dive into Night City with this premium PS5 setup featuring 4K HDR gaming and haptic feedback.',
    features = '["PlayStation 5 Console", "4K HDR Gaming", "DualSense Haptic Controller", "Premium Gaming Headset", "Cyberpunk 2077 Pre-installed"]',
    image_url = 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=400&h=300&fit=crop',
    hourly_rate = 150.00
WHERE name = 'PS5 Station 1';

UPDATE stations SET 
    name = 'Edgerunners PS5 Beta',
    description = 'Experience the world of Edgerunners with exclusive anime-themed setup and surround sound.',
    features = '["PlayStation 5 Console", "7.1 Surround Sound", "Anime Game Collection", "Racing Wheel Support", "RGB Lighting"]',
    image_url = 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400&h=300&fit=crop',
    hourly_rate = 150.00
WHERE name = 'PS5 Station 2';

UPDATE stations SET 
    name = 'Corpo PC Rig Neo',
    description = 'High-end corporate-grade gaming PC with RTX 4080 for the ultimate cyberpunk experience.',
    features = '["RTX 4080 Graphics", "32GB RAM", "Mechanical RGB Keyboard", "144Hz Monitor", "Cyberpunk Game Library"]',
    image_url = 'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=400&h=300&fit=crop',
    hourly_rate = 120.00
WHERE name = 'PC Gaming Rig 1';

UPDATE stations SET 
    name = 'Netrunner PC Matrix',
    description = 'Ultra-performance netrunner setup with RTX 4090 and curved ultrawide for immersive hacking.',
    features = '["RTX 4090 Graphics", "64GB RAM", "Curved Ultrawide Monitor", "Neon RGB Setup", "Streaming Ready"]',
    image_url = 'https://images.unsplash.com/photo-1593640495253-23196b27a87f?w=400&h=300&fit=crop',
    hourly_rate = 140.00
WHERE name = 'PC Gaming Rig 2';

-- Add 6 new stations
INSERT INTO stations (name, type, hourly_rate, description, features, image_url, available) VALUES
('Arasaka PS5 Gamma', 'PS5', 160.00, 'Elite Arasaka-themed PS5 station with PSVR2 support and premium accessories.', '["PlayStation 5 Console", "PSVR2 Support", "Premium Accessories", "Climate Control", "Exclusive Games"]', 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=400&h=300&fit=crop', true),

('Militech PC Cyber', 'PC', 130.00, 'Military-grade gaming setup with liquid cooling and tactical peripherals.', '["RTX 4080 Graphics", "Liquid Cooling", "Tactical Peripherals", "Dual 27\" Monitors", "VR Ready"]', 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&h=300&fit=crop', true),

('Valentino PS5 Delta', 'PS5', 155.00, 'Street-style PS5 setup with custom neon lighting and premium sound system.', '["PlayStation 5 Console", "Custom Neon Lighting", "Premium Sound System", "Street Racing Games", "Comfortable Gaming Chair"]', 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=400&h=300&fit=crop', false),

('Maelstrom PC Chaos', 'PC', 125.00, 'Chaotic high-performance rig with aggressive cooling and punk aesthetics.', '["RTX 4070 Graphics", "Aggressive Cooling", "Punk RGB Lighting", "Gaming Mechanical Keyboard", "High-DPI Gaming Mouse"]', 'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=400&h=300&fit=crop', true),

('Afterlife PS5 Omega', 'PS5', 165.00, 'Legendary Afterlife bar themed PS5 with exclusive content and premium setup.', '["PlayStation 5 Console", "Exclusive Content", "Premium Gaming Setup", "Afterlife Theme", "Professional Gaming Chair"]', 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400&h=300&fit=crop', true),

('Rogue PC Terminal', 'PC', 135.00, 'Rogue-class gaming terminal with stealth setup and advanced peripherals.', '["RTX 4080 Graphics", "Stealth Black Setup", "Advanced Peripherals", "Triple Monitor Setup", "Noise Cancelling Headset"]', 'https://images.unsplash.com/photo-1593640495253-23196b27a87f?w=400&h=300&fit=crop', true);

-- Done! Now you have 10 cyberpunk-themed stations 