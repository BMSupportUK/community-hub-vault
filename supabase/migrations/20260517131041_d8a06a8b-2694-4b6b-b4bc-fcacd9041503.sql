CREATE TABLE IF NOT EXISTS public.home_quick_link_order (
  key text PRIMARY KEY,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.home_quick_link_order ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hqlo read approved"
ON public.home_quick_link_order FOR SELECT TO authenticated
USING ((NOT has_role(auth.uid(), 'pending'::app_role)) AND (NOT has_role(auth.uid(), 'banned'::app_role)));

CREATE POLICY "hqlo manage admin"
ON public.home_quick_link_order FOR ALL TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]))
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]));

INSERT INTO public.home_quick_link_order (key, sort_order) VALUES
  ('community', 10),
  ('tickets', 20),
  ('status', 30),
  ('shop', 40),
  ('install-guides', 50),
  ('invite', 60)
ON CONFLICT (key) DO NOTHING;