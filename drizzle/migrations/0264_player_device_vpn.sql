ALTER TABLE public.player_devices ADD COLUMN IF NOT EXISTS vpn_status text;
ALTER TABLE public.player_devices ADD COLUMN IF NOT EXISTS vpn_provider text;
ALTER TABLE public.player_devices ADD COLUMN IF NOT EXISTS vpn_checked_at timestamptz;