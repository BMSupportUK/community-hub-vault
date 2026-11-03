CREATE TABLE public.player_connection_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.player_devices(id) ON DELETE CASCADE,
  user_id uuid,
  iptv_username text,
  active_connections integer NOT NULL CHECK (active_connections >= 0),
  max_connections integer NOT NULL CHECK (max_connections >= 0),
  exceeded_since timestamptz NOT NULL,
  ip text,
  app_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.player_connection_reports TO authenticated;
GRANT ALL ON public.player_connection_reports TO service_role;
ALTER TABLE public.player_connection_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read player connection reports" ON public.player_connection_reports
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX player_connection_reports_device_created_idx ON public.player_connection_reports(device_id, created_at DESC);
CREATE INDEX player_connection_reports_created_idx ON public.player_connection_reports(created_at DESC);