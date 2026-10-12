CREATE OR REPLACE FUNCTION public.admin_set_account_setup(p_order_id uuid, p_done boolean)
 RETURNS timestamp with time zone LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v timestamptz; _when timestamptz;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT CASE WHEN customer_type = 'manual' THEN created_at ELSE now() END INTO _when
    FROM private.orders WHERE id = p_order_id;
  UPDATE public.order_checkout_links
     SET account_setup_at = CASE WHEN p_done THEN coalesce(_when, now()) ELSE NULL END,
         account_setup_by = CASE WHEN p_done THEN auth.uid() ELSE NULL END
   WHERE order_id = p_order_id
   RETURNING account_setup_at INTO v;
  IF NOT FOUND THEN RAISE EXCEPTION 'This order has no secure checkout page'; END IF;
  RETURN v;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_complete_paid_order(_order_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
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
  UPDATE private.orders SET status='completed',
    completed_at = CASE WHEN o.customer_type = 'manual' THEN o.created_at ELSE now() END,
    completed_by=auth.uid(), updated_at=now() WHERE id=_order_id;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_complete_manual_order(_order_id uuid, _method text DEFAULT NULL::text, _reference text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private'
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
  IF _m IN ('square','stripe') AND EXISTS (
    SELECT 1 FROM public.order_payments
    WHERE provider = _m AND provider_payment_id = _ref AND order_id <> _order_id
  ) THEN RAISE EXCEPTION 'That transaction ID is already linked to another order'; END IF;
  UPDATE private.orders SET status = 'completed', paid_at = now(), paid_by = auth.uid(), completed_at = o.created_at, completed_by = auth.uid(), updated_at = now() WHERE id = _order_id;
  INSERT INTO public.order_payments (order_id, provider, provider_payment_id, amount_cents, currency, status, created_by)
  VALUES (_order_id, _m, _ref, o.total_cents, 'GBP', 'COMPLETED', auth.uid())
  ON CONFLICT (order_id) DO UPDATE SET provider = EXCLUDED.provider, provider_payment_id = EXCLUDED.provider_payment_id,
    amount_cents = EXCLUDED.amount_cents, status = 'COMPLETED', created_by = EXCLUDED.created_by, updated_at = now();
  IF _m = 'wise' THEN
    INSERT INTO public.wise_email_payments (sender_name, amount_cents, reference, received_at, order_id)
    VALUES (o.shipping_name, o.total_cents, coalesce(_ref, 'Manual order'), now(), _order_id)
    ON CONFLICT DO NOTHING;
  END IF;
END $function$;