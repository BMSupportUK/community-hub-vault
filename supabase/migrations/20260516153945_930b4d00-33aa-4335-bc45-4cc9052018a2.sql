-- Allow admin/management to delete order items on non-completed orders
CREATE POLICY "order_items delete admin"
ON public.order_items
FOR DELETE
TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])
  AND EXISTS (
    SELECT 1 FROM private.orders o
    WHERE o.id = order_items.order_id
      AND o.status <> 'completed'
      AND o.completed_at IS NULL
  )
);

-- Recompute order total whenever an item is removed
CREATE OR REPLACE FUNCTION public.recompute_order_total_after_item_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  new_subtotal INTEGER;
  disc INTEGER;
BEGIN
  SELECT COALESCE(SUM(unit_price_cents * quantity), 0)
    INTO new_subtotal
    FROM public.order_items
    WHERE order_id = OLD.order_id;

  SELECT COALESCE(discount_cents, 0) INTO disc
    FROM private.orders WHERE id = OLD.order_id;

  UPDATE private.orders
    SET total_cents = GREATEST(new_subtotal - COALESCE(disc, 0), 0)
    WHERE id = OLD.order_id;

  RETURN OLD;
END; $$;

DROP TRIGGER IF EXISTS trg_recompute_order_total_after_item_delete ON public.order_items;
CREATE TRIGGER trg_recompute_order_total_after_item_delete
AFTER DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.recompute_order_total_after_item_delete();