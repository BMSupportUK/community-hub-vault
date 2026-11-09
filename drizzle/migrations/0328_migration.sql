CREATE TABLE public.player_totp (
  owner_id uuid PRIMARY KEY,
  secret text,
  pending_secret text,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.player_totp TO service_role;
ALTER TABLE public.player_totp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_devices ADD COLUMN IF NOT EXISTS totp_passed_at timestamptz;