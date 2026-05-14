CREATE TABLE IF NOT EXISTS public.shop_policies (
  key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.shop_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_policies read approved" ON public.shop_policies
FOR SELECT TO authenticated
USING (NOT public.has_role(auth.uid(), 'pending'::app_role) AND NOT public.has_role(auth.uid(), 'banned'::app_role));

CREATE POLICY "shop_policies manage admin" ON public.shop_policies
FOR ALL TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]));

CREATE TRIGGER shop_policies_set_updated_at
BEFORE UPDATE ON public.shop_policies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.shop_policies (key, title, body) VALUES
  ('refund', 'Refund Policy', ''),
  ('multi_room', 'Multi-room Usage Rules', ''),
  ('triple_room', 'Triple-room Usage Rules', '')
ON CONFLICT (key) DO NOTHING;