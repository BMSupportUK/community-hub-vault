CREATE OR REPLACE VIEW public.orders AS
 SELECT id,
    user_id,
    (status)::text AS status,
    total_cents,
    discount_cents,
    discount_code,
    shipping_name,
    customer_type,
    existing_username,
    notes,
        CASE
            WHEN ((user_id = auth.uid()) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])) THEN private.app_decrypt(shipping_address_enc)
            ELSE NULL::text
        END AS shipping_address,
        CASE
            WHEN ((user_id = auth.uid()) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])) THEN private.app_decrypt(email_enc)
            ELSE NULL::text
        END AS email,
    paid_at,
    paid_by,
    completed_at,
    completed_by,
    created_at,
    updated_at,
    wants_adult_content,
    order_ref,
    manual_pay_method
   FROM private.orders;

CREATE OR REPLACE FUNCTION public.admin_create_manual_order(_customer_name text, _items jsonb, _method text DEFAULT NULL::text, _reference text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE _id uuid; _total int := 0; _it jsonb; _p record; _q int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF coalesce(trim(_customer_name),'') = '' THEN RAISE EXCEPTION 'Customer name required'; END IF;
  IF jsonb_array_length(coalesce(_items,'[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'Pick at least one product'; END IF;
  IF _method IS NOT NULL AND _method NOT IN ('square','stripe','crypto','cash','wise') THEN RAISE EXCEPTION 'Pick a payment method'; END IF;
  INSERT INTO private.orders (user_id, status, total_cents, shipping_name, customer_type, notes, manual_pay_method)
  VALUES (auth.uid(), 'pending', 0, trim(_customer_name), 'manual', 'Manually added by admin', _method)
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