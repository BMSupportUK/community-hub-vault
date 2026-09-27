CREATE OR REPLACE FUNCTION public.admin_create_manual_order(_customer_name text, _items jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE _id uuid; _total int := 0; _it jsonb; _p record; _q int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF coalesce(trim(_customer_name),'') = '' THEN RAISE EXCEPTION 'Customer name required'; END IF;
  IF jsonb_array_length(coalesce(_items,'[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'Pick at least one product'; END IF;
  INSERT INTO private.orders (user_id, status, total_cents, shipping_name, customer_type, notes)
  VALUES (auth.uid(), 'pending', 0, trim(_customer_name), 'manual', 'Manually added by admin')
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
END $$;

CREATE OR REPLACE FUNCTION public.admin_complete_manual_order(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE private.orders SET status = 'completed', completed_at = now(), completed_by = auth.uid(),
    paid_at = coalesce(paid_at, now()), paid_by = coalesce(paid_by, auth.uid()), updated_at = now()
  WHERE id = _order_id AND customer_type = 'manual';
  IF NOT FOUND THEN RAISE EXCEPTION 'Manual order not found'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.admin_create_manual_order(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_complete_manual_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_manual_order(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_complete_manual_order(uuid) TO authenticated;