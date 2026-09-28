CREATE OR REPLACE FUNCTION public.admin_create_manual_order(_customer_name text, _items jsonb, _method text DEFAULT NULL::text, _reference text DEFAULT NULL::text, _created_at timestamptz DEFAULT NULL::timestamptz)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE _id uuid; _total int := 0; _it jsonb; _p record; _q int; _ts timestamptz := coalesce(_created_at, now());
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF coalesce(trim(_customer_name),'') = '' THEN RAISE EXCEPTION 'Customer name required'; END IF;
  IF jsonb_array_length(coalesce(_items,'[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'Pick at least one product'; END IF;
  IF _method IS NOT NULL AND _method NOT IN ('square','stripe','crypto','cash','wise') THEN RAISE EXCEPTION 'Pick a payment method'; END IF;
  IF _created_at IS NOT NULL AND _created_at > now() + interval '5 minutes' THEN RAISE EXCEPTION 'Order date cannot be in the future'; END IF;
  INSERT INTO private.orders (user_id, status, total_cents, shipping_name, customer_type, notes, manual_pay_method, created_at)
  VALUES (auth.uid(), 'pending', 0, trim(_customer_name), 'manual', 'Manually added by admin', _method, _ts)
  RETURNING id INTO _id;
  FOR _it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT id, name, price_cents INTO _p FROM public.products WHERE id = (_it->>'product_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown product'; END IF;
    _q := greatest(1, coalesce((_it->>'quantity')::int, 1));
    INSERT INTO public.order_items (order_id, product_id, product_name, unit_price_cents, quantity)
    VALUES (_id, _p.id, _p.name, _p.price_cents, _q);
    _total := _total + _p.price_cents * _q;
  END LOOP;
  UPDATE private.orders SET total_cents = _total, updated_at = _ts WHERE id = _id;
  RETURN _id;
END
$function$;

GRANT EXECUTE ON FUNCTION public.admin_create_manual_order(text, jsonb, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_manual_order(text, jsonb, text, text, timestamptz) TO service_role;