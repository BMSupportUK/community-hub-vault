CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings read approved" ON public.app_settings
  FOR SELECT TO authenticated
  USING ((NOT has_role(auth.uid(), 'pending'::app_role)) AND (NOT has_role(auth.uid(), 'banned'::app_role)));

CREATE POLICY "app_settings manage admin" ON public.app_settings
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]));

INSERT INTO public.app_settings (key, value)
VALUES ('currency', '{"code":"GBP","symbol":"£","locale":"en-GB"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;
ALTER TABLE public.app_settings REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.notify_new_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uname TEXT;
  csym TEXT;
BEGIN
  SELECT COALESCE(display_name, username, 'A customer') INTO uname FROM public.profiles WHERE id = NEW.user_id;
  SELECT COALESCE(value->>'symbol', '£') INTO csym FROM public.app_settings WHERE key = 'currency';
  INSERT INTO public.staff_notifications (kind, title, body, link_path, entity_id)
  VALUES ('order_placed', 'New order', uname || ' placed an order (' || csym || (NEW.total_cents/100.0)::numeric(10,2) || ')', '/shop?view=admin', NEW.id);
  RETURN NEW;
END; $$;