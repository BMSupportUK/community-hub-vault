ALTER TABLE public.player_devices ADD COLUMN channel_link_snapshot jsonb;
ALTER TABLE public.player_connection_sessions ADD COLUMN channel_link_snapshot jsonb;
COMMENT ON COLUMN public.player_devices.channel_link_snapshot IS 'Validated current-playback ChannelLink snapshot: smoothed ping, two-minute stalls/reconnects, delivery ratio and report time.';
COMMENT ON COLUMN public.player_connection_sessions.channel_link_snapshot IS 'Last exact box ChannelLink snapshot for this full-screen session; null for legacy records without exact evidence.';