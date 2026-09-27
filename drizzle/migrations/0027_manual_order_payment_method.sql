DROP FUNCTION IF EXISTS public.admin_complete_manual_order(uuid);
CREATE OR REPLACE FUNCTION public.admin_complete_manual_order(_order_id uuid, _method text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE _total int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _method NOT IN ('square','stripe','crypto','cash') THEN RAISE EXCEPTION 'Pick a payment method'; END IF;
  UPDATE private.orders SET status = 'completed', completed_at = now(), completed_by = auth.uid(),
    paid_at = coalesce(paid_at, now()), paid_by = coalesce(paid_by, auth.uid()), updated_at = now()
  WHERE id = _order_id AND customer_type = 'manual' RETURNING total_cents INTO _total;
  IF NOT FOUND THEN RAISE EXCEPTION 'Manual order not found'; END IF;
  INSERT INTO public.order_payments (order_id, status, amount_cents, provider, created_by)
  VALUES (_order_id, 'COMPLETED', _total, _method, auth.uid())
  ON CONFLICT (order_id) DO UPDATE SET provider = EXCLUDED.provider, status = 'COMPLETED', updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.admin_complete_manual_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_complete_manual_order(uuid, text) TO authenticated;