CREATE TABLE public.tv_helper_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  ip_hash text NOT NULL,
  helper_version text,
  device text,
  step text NOT NULL,
  message text
);
GRANT SELECT ON public.tv_helper_diagnostics TO authenticated;
GRANT ALL ON public.tv_helper_diagnostics TO service_role;
ALTER TABLE public.tv_helper_diagnostics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read TV helper diagnostics" ON public.tv_helper_diagnostics
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX tv_helper_diagnostics_created_idx ON public.tv_helper_diagnostics (created_at DESC);
CREATE INDEX tv_helper_diagnostics_ip_idx ON public.tv_helper_diagnostics (ip_hash, created_at DESC);