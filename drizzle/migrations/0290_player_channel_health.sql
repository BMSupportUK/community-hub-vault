CREATE TABLE public.player_channel_health (
  channel_key text PRIMARY KEY,
  channel_name text NOT NULL,
  problem text,
  problem_source text,
  last_problem_at timestamptz,
  last_ok_at timestamptz,
  last_checked_at timestamptz,
  reporters integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.player_channel_health TO authenticated;
GRANT ALL ON public.player_channel_health TO service_role;
ALTER TABLE public.player_channel_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin and management read channel health" ON public.player_channel_health FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));
CREATE POLICY "Admin clears channel health" ON public.player_channel_health FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX player_channel_health_problem_idx ON public.player_channel_health (last_problem_at DESC);