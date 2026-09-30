CREATE TABLE public.order_checkout_links (
  order_id uuid PRIMARY KEY,
  token text NOT NULL UNIQUE,
  password text NOT NULL,
  customer_kind text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.order_checkout_links TO authenticated;
GRANT ALL ON public.order_checkout_links TO service_role;
ALTER TABLE public.order_checkout_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checkout links admin read" ON public.order_checkout_links FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]));

CREATE TABLE public.checkout_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  sender text NOT NULL CHECK (sender IN ('customer','staff')),
  staff_id uuid,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checkout_chat_order_idx ON public.checkout_chat_messages(order_id, created_at);
GRANT SELECT, INSERT ON public.checkout_chat_messages TO authenticated;
GRANT ALL ON public.checkout_chat_messages TO service_role;
ALTER TABLE public.checkout_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checkout chat staff read" ON public.checkout_chat_messages FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]));
CREATE POLICY "checkout chat staff insert" ON public.checkout_chat_messages FOR INSERT TO authenticated
  WITH CHECK (sender = 'staff' AND staff_id = auth.uid() AND public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]));
ALTER PUBLICATION supabase_realtime ADD TABLE public.checkout_chat_messages;

CREATE OR REPLACE FUNCTION public.admin_create_manual_order_v2(
  _customer_name text, _items jsonb, _method text, _email text DEFAULT NULL,
  _discount_cents int DEFAULT 0, _customer_kind text DEFAULT 'new', _created_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private' AS $$
DECLARE _id uuid; _total int := 0; _it jsonb; _p record; _q int; _ts timestamptz := coalesce(_created_at, now()); _disc int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF coalesce(trim(_customer_name),'') = '' THEN RAISE EXCEPTION 'Customer name required'; END IF;
  IF jsonb_array_length(coalesce(_items,'[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'Pick at least one product'; END IF;
  IF _method IS NULL OR _method NOT IN ('square','stripe','cash','wise') THEN RAISE EXCEPTION 'Pick a payment method'; END IF;
  IF _customer_kind NOT IN ('new','existing') THEN RAISE EXCEPTION 'Pick new or existing customer'; END IF;
  IF _method IN ('square','stripe') AND coalesce(trim(_email),'') = '' THEN RAISE EXCEPTION 'An email address is needed for card invoices'; END IF;
  IF _created_at IS NOT NULL AND _created_at > now() + interval '5 minutes' THEN RAISE EXCEPTION 'Order date cannot be in the future'; END IF;
  INSERT INTO private.orders (user_id, status, total_cents, shipping_name, customer_type, notes, manual_pay_method, created_at, email_enc)
  VALUES (auth.uid(), 'pending', 0, trim(_customer_name), 'manual', 'Manually added by admin', _method, _ts,
    CASE WHEN coalesce(trim(_email),'') = '' THEN NULL ELSE app_encrypt(lower(trim(_email))) END)
  RETURNING id INTO _id;
  FOR _it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT id, name, price_cents INTO _p FROM public.products WHERE id = (_it->>'product_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown product'; END IF;
    _q := greatest(1, coalesce((_it->>'quantity')::int, 1));
    INSERT INTO public.order_items (order_id, product_id, product_name, unit_price_cents, quantity)
    VALUES (_id, _p.id, _p.name, _p.price_cents, _q);
    _total := _total + _p.price_cents * _q;
  END LOOP;
  _disc := greatest(0, least(coalesce(_discount_cents,0), _total));
  UPDATE private.orders SET total_cents = _total - _disc, discount_cents = _disc, updated_at = _ts WHERE id = _id;
  INSERT INTO public.order_checkout_links (order_id, token, password, customer_kind)
  VALUES (_id,
    replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
    upper(substr(replace(gen_random_uuid()::text,'-',''),1,4)) || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,4)) || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,4)),
    _customer_kind);
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.admin_create_manual_order_v2(text,jsonb,text,text,int,text,timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_manual_order_v2(text,jsonb,text,text,int,text,timestamptz) TO authenticated;