CREATE TABLE public.upcoming_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body text NOT NULL DEFAULT '',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.upcoming_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY "upcoming_event public read" ON public.upcoming_event
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "upcoming_event staff insert" ON public.upcoming_event
  FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','management','staff']::app_role[]));

CREATE POLICY "upcoming_event staff update" ON public.upcoming_event
  FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin','management','staff']::app_role[]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','management','staff']::app_role[]));

CREATE TRIGGER upcoming_event_updated_at BEFORE UPDATE ON public.upcoming_event
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.upcoming_event (body) VALUES ('Stay tuned for our next big event!');