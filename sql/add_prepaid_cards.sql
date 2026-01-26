-- Prepaid plans configured by admin
CREATE TABLE IF NOT EXISTS prepaid_plans (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  price numeric(10,2) NOT NULL,
  minutes integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- User-owned prepaid cards / balances
CREATE TABLE IF NOT EXISTS user_prepaid_cards (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  plan_id uuid NOT NULL REFERENCES prepaid_plans(id),
  total_minutes integer NOT NULL,
  remaining_minutes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tag bookings that use prepaid
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS billing_type text DEFAULT 'POSTPAID',
  ADD COLUMN IF NOT EXISTS prepaid_card_id uuid,
  ADD COLUMN IF NOT EXISTS prepaid_minutes_used integer DEFAULT 0;





