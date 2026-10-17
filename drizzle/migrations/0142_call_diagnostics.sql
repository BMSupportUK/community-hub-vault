CREATE TABLE public.call_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  side text NOT NULL CHECK (side IN ('customer','staff')),
  event text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX call_diagnostics_topic_idx ON public.call_diagnostics(topic, created_at DESC);
CREATE INDEX call_diagnostics_created_idx ON public.call_diagnostics(created_at DESC);
GRANT SELECT, INSERT ON public.call_diagnostics TO authenticated;
GRANT ALL ON public.call_diagnostics TO service_role;
ALTER TABLE public.call_diagnostics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff record call diagnostics" ON public.call_diagnostics
FOR INSERT TO authenticated WITH CHECK (
  recorded_by = auth.uid() AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'moderator'))
);
CREATE POLICY "Admin and management read call diagnostics" ON public.call_diagnostics
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management')
);