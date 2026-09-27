CREATE OR REPLACE FUNCTION public.admin_complete_manual_order(_order_id uuid, _method text DEFAULT NULL::text, _reference text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE o record; _m text; _ref text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO o FROM private.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.customer_type <> 'manual' THEN RAISE EXCEPTION 'Not a manual order'; END IF;
  IF o.status IN ('paid','completed') THEN RAISE EXCEPTION 'Order already completed'; END IF;
  _m := coalesce(_method, o.manual_pay_method);
  _ref := nullif(trim(coalesce(_reference, '')), '');
  IF _m IS NULL OR _m NOT IN ('square','stripe','crypto','cash','wise') THEN RAISE EXCEPTION 'Pick a payment method'; END IF;
  IF _m IN ('square','stripe') AND _ref IS NULL THEN RAISE EXCEPTION 'Transaction ID required'; END IF;
  IF _m IN ('square','stripe') AND EXISTS (SELECT 1 FROM public.order_payments WHERE provider = _m AND provider_ref = _ref) THEN RAISE EXCEPTION 'That transaction ID is already linked to another order'; END IF;
  UPDATE private.orders SET status = 'completed', paid_at = now(), paid_by = auth.uid(), completed_at = now(), completed_by = auth.uid(), updated_at = now() WHERE id = _order_id;
  INSERT INTO public.order_payments (order_id, user_id, provider, provider_ref, amount_cents, status, paid_at)
  VALUES (_order_id, o.user_id, _m, _ref, o.total_cents, 'paid', now());
  IF _m = 'wise' THEN
    INSERT INTO public.wise_email_payments (sender_name, amount_cents, reference, received_at, order_id)
    VALUES (o.shipping_name, o.total_cents, coalesce(_ref, 'Manual order'), now(), _order_id)
    ON CONFLICT DO NOTHING;
  END IF;
END $function$;