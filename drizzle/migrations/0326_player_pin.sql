CREATE TABLE public.player_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid UNIQUE,
  offsite_customer_id uuid UNIQUE,
  pin_hash text NOT NULL,
  salt text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_pins_one_owner CHECK ((owner_id IS NULL) <> (offsite_customer_id IS NULL))
);
GRANT ALL ON public.player_pins TO service_role;
GRANT SELECT ON public.player_pins TO authenticated;
ALTER TABLE public.player_pins ENABLE ROW LEVEL SECURITY;
-- Owners may only see that a PIN exists (hash columns are never selected by the app); writes go through the server.
CREATE POLICY "Owners see their own PIN row" ON public.player_pins FOR SELECT TO authenticated USING (owner_id = auth.uid());
ALTER TABLE public.player_devices
  ADD COLUMN IF NOT EXISTS pin_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS pin_lock_level integer NOT NULL DEFAULT 0;