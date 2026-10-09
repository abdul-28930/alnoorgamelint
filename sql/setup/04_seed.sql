-- Noor Gaming Lab DB setup - seed data (admin email, stations, rewards)
-- Run files in order (01 -> 04) in the Supabase SQL Editor. Safe to re-run.

-- ---------------------------------------------------------------------
-- 6. Seed data
-- ---------------------------------------------------------------------

-- Single settings row. >>> PUT YOUR ADMIN EMAIL(S) HERE <<<
INSERT INTO admin_settings (id, admin_emails, food_items)
VALUES (1, '["your-admin-email@example.com"]', '[]')
ON CONFLICT (id) DO NOTHING;

-- Stations (cyberpunk set). Run this file only ONCE, or you will get duplicate stations.
INSERT INTO stations (name, type, hourly_rate, description, features, image_url, active) VALUES
 ('Night City PS5 Alpha', 'PS5', 150.00, 'Dive into Night City with this premium PS5 setup featuring 4K HDR gaming and haptic feedback.',
  '["PlayStation 5 Console","4K HDR Gaming","DualSense Haptic Controller","Premium Gaming Headset","Cyberpunk 2077 Pre-installed"]'::jsonb,
  'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=400&h=300&fit=crop', true),
 ('Edgerunners PS5 Beta', 'PS5', 150.00, 'Experience the world of Edgerunners with exclusive anime-themed setup and surround sound.',
  '["PlayStation 5 Console","7.1 Surround Sound","Anime Game Collection","Racing Wheel Support","RGB Lighting"]'::jsonb,
  'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400&h=300&fit=crop', true),
 ('Corpo PC Rig Neo', 'PC', 120.00, 'High-end corporate-grade gaming PC with RTX 4080 for the ultimate cyberpunk experience.',
  '["RTX 4080 Graphics","32GB RAM","Mechanical RGB Keyboard","144Hz Monitor","Cyberpunk Game Library"]'::jsonb,
  'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=400&h=300&fit=crop', true),
 ('Netrunner PC Matrix', 'PC', 140.00, 'Ultra-performance netrunner setup with RTX 4090 and curved ultrawide for immersive hacking.',
  '["RTX 4090 Graphics","64GB RAM","Curved Ultrawide Monitor","Neon RGB Setup","Streaming Ready"]'::jsonb,
  'https://images.unsplash.com/photo-1593640495253-23196b27a87f?w=400&h=300&fit=crop', true),
 ('Arasaka PS5 Gamma', 'PS5', 160.00, 'Elite Arasaka-themed PS5 station with PSVR2 support and premium accessories.',
  '["PlayStation 5 Console","PSVR2 Support","Premium Accessories","Climate Control","Exclusive Games"]'::jsonb,
  'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=400&h=300&fit=crop', true),
 ('Militech PC Cyber', 'PC', 130.00, 'Military-grade gaming setup with liquid cooling and tactical peripherals.',
  '["RTX 4080 Graphics","Liquid Cooling","Tactical Peripherals","Dual 27-inch Monitors","VR Ready"]'::jsonb,
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&h=300&fit=crop', true),
 ('Valentino PS5 Delta', 'PS5', 155.00, 'Street-style PS5 setup with custom neon lighting and premium sound system.',
  '["PlayStation 5 Console","Custom Neon Lighting","Premium Sound System","Street Racing Games","Comfortable Gaming Chair"]'::jsonb,
  'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=400&h=300&fit=crop', false),
 ('Maelstrom PC Chaos', 'PC', 125.00, 'Chaotic high-performance rig with aggressive cooling and punk aesthetics.',
  '["RTX 4070 Graphics","Aggressive Cooling","Punk RGB Lighting","Gaming Mechanical Keyboard","High-DPI Gaming Mouse"]'::jsonb,
  'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=400&h=300&fit=crop', true),
 ('Afterlife PS5 Omega', 'PS5', 165.00, 'Legendary Afterlife bar themed PS5 with exclusive content and premium setup.',
  '["PlayStation 5 Console","Exclusive Content","Premium Gaming Setup","Afterlife Theme","Professional Gaming Chair"]'::jsonb,
  'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400&h=300&fit=crop', true),
 ('Rogue PC Terminal', 'PC', 135.00, 'Rogue-class gaming terminal with stealth setup and advanced peripherals.',
  '["RTX 4080 Graphics","Stealth Black Setup","Advanced Peripherals","Triple Monitor Setup","Noise Cancelling Headset"]'::jsonb,
  'https://images.unsplash.com/photo-1593640495253-23196b27a87f?w=400&h=300&fit=crop', true)
;

-- Points rewards catalogue
INSERT INTO points_rewards (name, points_cost, discount_percentage, description)
SELECT * FROM (VALUES
 ('₹5 Discount Coupon',  500,  5.0,  '5% off your next booking'),
 ('₹10 Discount Coupon', 1000, 10.0, '10% off your next booking'),
 ('₹25 Discount Coupon', 2500, 25.0, '25% off your next booking'),
 ('₹50 Discount Coupon', 5000, 50.0, '50% off your next booking')
) AS v(name, points_cost, discount_percentage, description)
WHERE NOT EXISTS (SELECT 1 FROM points_rewards);

-- Ask PostgREST to pick up the new schema immediately
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- DONE. After running:
--   1. Replace the admin email above (or: UPDATE admin_settings SET admin_emails='["you@x.com"]' WHERE id=1;)
--   2. Sign up once through the app, then optionally promote yourself:
--        INSERT INTO user_roles (user_id, role) VALUES ('<your auth.users id>', 'admin')
--        ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
-- =====================================================================
