ALTER TABLE public.signup_info
  ADD COLUMN IF NOT EXISTS is_vpn boolean,
  ADD COLUMN IF NOT EXISTS is_proxy boolean,
  ADD COLUMN IF NOT EXISTS vpn_provider text,
  ADD COLUMN IF NOT EXISTS isp text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS vpn_raw jsonb;