CREATE TABLE public.order_remote_setup (
  order_id uuid PRIMARY KEY,
  device text NOT NULL CHECK (device IN ('amazon','android')),
  app_checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  app_checked_at timestamptz,
  completed_at timestamptz,
  verified_session_id uuid,
  setup_code_hash text,
  setup_code_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.order_remote_setup TO authenticated;
GRANT ALL ON public.order_remote_setup TO service_role;
ALTER TABLE public.order_remote_setup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read order remote setup" ON public.order_remote_setup FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management','staff']::app_role[]));
CREATE UNIQUE INDEX order_remote_setup_code_idx ON public.order_remote_setup(setup_code_hash) WHERE setup_code_hash IS NOT NULL;