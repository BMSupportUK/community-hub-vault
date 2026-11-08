CREATE TABLE public.player_watch_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.player_devices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('film','series')),
  item_id text,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
CREATE INDEX player_watch_requests_pending ON public.player_watch_requests (device_id, created_at) WHERE delivered_at IS NULL;
GRANT SELECT ON public.player_watch_requests TO authenticated;
GRANT ALL ON public.player_watch_requests TO service_role;
ALTER TABLE public.player_watch_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read own watch requests" ON public.player_watch_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);