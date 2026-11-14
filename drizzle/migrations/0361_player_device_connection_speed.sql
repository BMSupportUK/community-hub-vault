ALTER TABLE public.player_devices
 ADD COLUMN IF NOT EXISTS net_down_kbps integer,
 ADD COLUMN IF NOT EXISTS net_up_kbps integer,
 ADD COLUMN IF NOT EXISTS net_ping_ms integer,
 ADD COLUMN IF NOT EXISTS net_measured_at timestamptz;