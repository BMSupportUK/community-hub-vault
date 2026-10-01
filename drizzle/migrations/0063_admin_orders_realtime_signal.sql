CREATE TABLE IF NOT EXISTS public.order_change_signals (
  id int PRIMARY KEY DEFAULT 1,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_change_signals_single CHECK (id = 1)
);
GRANT SELECT ON public.order_change_signals TO authenticated;
GRANT ALL ON public.order_change_signals TO service_role;
ALTER TABLE public.order_change_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and management read order signals" ON public.order_change_signals
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));
INSERT INTO public.order_change_signals (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.tg_bump_order_change_signal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.order_change_signals (id, changed_at) VALUES (1, now())
  ON CONFLICT (id) DO UPDATE SET changed_at = excluded.changed_at;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.tg_bump_order_change_signal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bump_order_change_signal ON private.orders;
CREATE TRIGGER bump_order_change_signal AFTER INSERT OR UPDATE OR DELETE ON private.orders
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_bump_order_change_signal();
DROP TRIGGER IF EXISTS bump_order_change_signal ON public.order_checkout_links;
CREATE TRIGGER bump_order_change_signal AFTER INSERT OR UPDATE OR DELETE ON public.order_checkout_links
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_bump_order_change_signal();

ALTER PUBLICATION supabase_realtime ADD TABLE public.order_change_signals;