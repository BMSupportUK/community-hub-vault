ALTER TABLE private.orders ADD COLUMN IF NOT EXISTS manual_pay_method text, ADD COLUMN IF NOT EXISTS manual_pay_reference text;

CREATE OR REPLACE FUNCTION public.admin_create_manual_order(_customer_name text, _items jsonb, _method text DEFAULT NULL::text, _reference text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE _id uuid; _total int := 0; _it jsonb; _p record; _q int; _ref text := nullif(trim(coalesce(_reference,'')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF coalesce(trim(_customer_name),'') = '' THEN RAISE EXCEPTION 'Customer name required'; END IF;
  IF jsonb_array_length(coalesce(_items,'[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'Pick at least one product'; END IF;
  IF _method IS NOT NULL AND _method NOT IN ('square','stripe','crypto','cash','wise') THEN RAISE EXCEPTION 'Pick a payment method'; END IF;
  IF _method IN ('square','stripe','wise') AND _ref IS NULL THEN RAISE EXCEPTION 'Enter the transaction ID'; END IF;
  INSERT INTO private.orders (user_id, status, total_cents, shipping_name, customer_type, notes, manual_pay_method, manual_pay_reference)
  VALUES (auth.uid(), 'pending', 0, trim(_customer_name), 'manual', 'Manually added by admin', _method, _ref)
  RETURNING id INTO _id;
  FOR _it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT id, name, price_cents INTO _p FROM public.products WHERE id = (_it->>'product_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown product'; END IF;
    _q := greatest(1, coalesce((_it->>'quantity')::int, 1));
    INSERT INTO public.order_items (order_id, product_id, product_name, unit_price_cents, quantity)
    VALUES (_id, _p.id, _p.name, _p.price_cents, _q);
    _total := _total + _p.price_cents * _q;
  END LOOP;
  UPDATE private.orders SET total_cents = _total WHERE id = _id;
  RETURN _id;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_complete_manual_order(_order_id uuid, _method text DEFAULT NULL::text, _reference text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE _total int; _name text; _ref text := nullif(trim(coalesce(_reference,'')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _method IS NULL THEN
    SELECT manual_pay_method INTO _method FROM private.orders WHERE id = _order_id AND customer_type = 'manual';
  END IF;
  IF _ref IS NULL THEN
    SELECT manual_pay_reference INTO _ref FROM private.orders WHERE id = _order_id AND customer_type = 'manual';
  END IF;
  IF _method IS NULL OR _method NOT IN ('square','stripe','crypto','cash','wise') THEN RAISE EXCEPTION 'Pick a payment method'; END IF;
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
END $function$;