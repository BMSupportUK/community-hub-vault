CREATE OR REPLACE FUNCTION public.admin_complete_paid_order(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private' AS $$
DECLARE o record;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management')) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO o FROM private.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status = 'completed' THEN RAISE EXCEPTION 'Order already completed'; END IF;
  IF o.status = 'cancelled' THEN RAISE EXCEPTION 'Order is cancelled'; END IF;
  IF o.paid_at IS NULL AND o.status <> 'paid' THEN RAISE EXCEPTION 'Order has not been paid yet'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.order_checkout_links WHERE order_id = _order_id AND account_setup_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Confirm the account setup first';
  END IF;
  UPDATE private.orders SET status='completed', completed_at=now(), completed_by=auth.uid(), updated_at=now() WHERE id=_order_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_complete_paid_order(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_complete_paid_order(uuid) TO authenticated;