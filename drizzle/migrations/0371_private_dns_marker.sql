ALTER TABLE public.player_devices ADD COLUMN private_dns_used text;
ALTER TABLE public.player_devices DROP CONSTRAINT IF EXISTS player_devices_private_dns_used_check;
ALTER TABLE public.player_devices ADD CONSTRAINT player_devices_private_dns_used_check CHECK (private_dns_used is null or private_dns_used in ('stream','list'));
COMMENT ON COLUMN public.player_devices.private_dns_used IS 'How the current playback reached its server: stream = the channel address came from an encrypted DNS lookup, list = only the channel list/guide lookups did, null = not used.';