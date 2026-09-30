CREATE OR REPLACE FUNCTION public.create_my_checkout_link(p_order_id uuid, p_method text)
RETURNS TABLE(token text, password text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private' AS $$
DECLARE _o record; _kind text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF p_method NOT IN ('square','stripe','wise') THEN RAISE EXCEPTION 'Pick a payment method'; END IF;
  SELECT id, user_id, customer_type, paid_at INTO _o FROM private.orders WHERE id = p_order_id;
  IF NOT FOUND OR _o.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _o.paid_at IS NULL THEN
    UPDATE private.orders SET manual_pay_method = p_method WHERE id = p_order_id;
  END IF;
  _kind := CASE WHEN _o.customer_type = 'existing' THEN 'existing' ELSE 'new' END;
  INSERT INTO public.order_checkout_links (order_id, token, password, customer_kind, claimed_by)
  VALUES (p_order_id,
    replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
    upper(substr(replace(gen_random_uuid()::text,'-',''),1,4)) || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,4)) || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,4)),
    _kind, auth.uid())
  ON CONFLICT (order_id) DO NOTHING;
  RETURN QUERY SELECT l.token, l.password FROM public.order_checkout_links l WHERE l.order_id = p_order_id;
END $$;
REVOKE ALL ON FUNCTION public.create_my_checkout_link(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_my_checkout_link(uuid,text) TO authenticated;