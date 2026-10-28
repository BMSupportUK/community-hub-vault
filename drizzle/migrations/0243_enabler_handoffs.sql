CREATE TABLE public.enabler_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_hash text NOT NULL UNIQUE,
  device text NOT NULL CHECK (device IN ('amazon','android')),
  help_plan smallint NOT NULL CHECK (help_plan IN (1,2)),
  app_paths text[] NOT NULL DEFAULT '{}',
  ticket_id uuid,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours',
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX enabler_handoffs_user_idx ON public.enabler_handoffs (user_id, created_at DESC);
GRANT SELECT ON public.enabler_handoffs TO authenticated;
GRANT ALL ON public.enabler_handoffs TO service_role;
ALTER TABLE public.enabler_handoffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their handoffs" ON public.enabler_handoffs FOR SELECT TO authenticated USING (auth.uid() = user_id);