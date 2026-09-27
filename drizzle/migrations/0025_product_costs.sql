CREATE TABLE public.product_costs (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  cost_cents integer NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_costs TO authenticated;
GRANT ALL ON public.product_costs TO service_role;
ALTER TABLE public.product_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin/management manage product costs" ON public.product_costs FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]));

ALTER TABLE public.order_items ADD COLUMN unit_cost_cents integer;

CREATE OR REPLACE FUNCTION public.order_item_snapshot_cost() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.unit_cost_cents IS NULL AND NEW.product_id IS NOT NULL THEN
    SELECT cost_cents INTO NEW.unit_cost_cents FROM public.product_costs WHERE product_id = NEW.product_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER order_items_snapshot_cost BEFORE INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.order_item_snapshot_cost();

CREATE OR REPLACE FUNCTION public.product_cost_backfill() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.order_items SET unit_cost_cents = NEW.cost_cents
  WHERE product_id = NEW.product_id AND unit_cost_cents IS NULL;
  RETURN NEW;
END $$;
CREATE TRIGGER product_costs_backfill AFTER INSERT OR UPDATE ON public.product_costs
FOR EACH ROW EXECUTE FUNCTION public.product_cost_backfill();
REVOKE EXECUTE ON FUNCTION public.order_item_snapshot_cost() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.product_cost_backfill() FROM PUBLIC, anon, authenticated;