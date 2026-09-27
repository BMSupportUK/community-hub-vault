DROP FUNCTION IF EXISTS public.admin_complete_manual_order(uuid, text);
CREATE OR REPLACE FUNCTION public.admin_complete_manual_order(_order_id uuid, _method text, _reference text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE _total int; _name text; _ref text := nullif(trim(coalesce(_reference,'')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _method NOT IN ('square','stripe','crypto','cash','wise') THEN RAISE EXCEPTION 'Pick a payment method'; END IF;
  IF _method IN ('square','stripe','wise') AND _ref IS NULL THEN RAISE EXCEPTION 'Enter the transaction ID'; END IF;
  IF _ref IS NOT NULL AND _method IN ('square','stripe') AND EXISTS (SELECT 1 FROM public.order_payments WHERE provider = _method AND provider_payment_id = _ref AND order_id <> _order_id) THEN
    RAISE EXCEPTION 'That transaction ID is already linked to another order';
  END IF;
  UPDATE private.orders SET status = 'completed', completed_at = now(), completed_by = auth.uid(),
    paid_at = coalesce(paid_at, now()), paid_by = coalesce(paid_by, auth.uid()), updated_at = now()
  WHERE id = _order_id AND customer_type = 'manual' RETURNING total_cents, shipping_name INTO _total, _name;
  IF NOT FOUND THEN RAISE EXCEPTION 'Manual order not found'; END IF;
  INSERT INTO public.order_payments (order_id, status, amount_cents, provider, provider_payment_id, created_by)
  VALUES (_order_id, 'COMPLETED', _total, _method, _ref, auth.uid())
  ON CONFLICT (order_id) DO UPDATE SET provider = EXCLUDED.provider, provider_payment_id = EXCLUDED.provider_payment_id, status = 'COMPLETED', updated_at = now();
  IF _method = 'wise' THEN
    INSERT INTO public.wise_email_payments (amount_cents, currency, sender_name, reference, subject, excerpt, matched_order_id)
    VALUES (_total, 'GBP', _name, _ref, 'Manual order payment', 'Added by admin when completing a manual order', _order_id);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_complete_manual_order(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_complete_manual_order(uuid, text, text) TO authenticated;