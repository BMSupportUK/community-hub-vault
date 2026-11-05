CREATE TABLE public.player_watch_progress (
  owner_key text NOT NULL,
  scope_key text NOT NULL,
  item_key text NOT NULL,
  position_ms bigint NOT NULL DEFAULT 0,
  duration_ms bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_key, scope_key, item_key)
);
GRANT ALL ON public.player_watch_progress TO service_role;
ALTER TABLE public.player_watch_progress ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.player_watch_progress IS 'BM Player film/episode/series positions per account owner and provider login; reached only through the device-token player API.';