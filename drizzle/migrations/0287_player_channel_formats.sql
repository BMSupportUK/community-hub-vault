CREATE TABLE public.player_channel_formats (
  content_id text PRIMARY KEY,
  fmt text NOT NULL CHECK (fmt IN ('ts','m3u8')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.player_channel_formats TO service_role;
ALTER TABLE public.player_channel_formats ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.player_channel_formats IS 'Steadier stream type per live channel, learned from stalls on any BM Player and shared with every device.';