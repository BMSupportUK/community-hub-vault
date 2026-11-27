DROP POLICY IF EXISTS "Order owners insert own invoices" ON public.order_invoices;
DROP POLICY IF EXISTS "Order owners update own invoices" ON public.order_invoices;

CREATE OR REPLACE FUNCTION public.tg_breaks_owner_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]) THEN
    RETURN NEW;
  END IF;
  IF NEW.kind IS DISTINCT FROM OLD.kind OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.shift_id IS DISTINCT FROM OLD.shift_id OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR (OLD.ended_at IS NOT NULL AND NEW.ended_at IS DISTINCT FROM OLD.ended_at) THEN
    RAISE EXCEPTION 'Recorded breaks cannot be changed';
  END IF;
  IF NEW.ended_at IS NOT NULL AND NEW.ended_at > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'Break end time cannot be in the future';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_breaks_owner_immutable ON public.breaks;
CREATE TRIGGER trg_breaks_owner_immutable BEFORE UPDATE ON public.breaks
FOR EACH ROW EXECUTE FUNCTION public.tg_breaks_owner_immutable();

CREATE OR REPLACE FUNCTION public.reprice_customer_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE o private.orders%ROWTYPE; sub int; vpn int; code_disc int := 0; ref int; c public.discount_codes%ROWTYPE;
BEGIN
  SELECT * INTO o FROM private.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.paid_at IS NOT NULL OR o.completed_at IS NOT NULL OR o.status::text <> 'pending' THEN RETURN; END IF;
  UPDATE public.order_items i SET unit_price_cents = p.price_cents, product_name = p.name
    FROM public.products p WHERE i.order_id = p_order_id AND i.product_id = p.id
      AND (i.unit_price_cents IS DISTINCT FROM p.price_cents);
  UPDATE public.order_items SET unit_price_cents = 200
    WHERE order_id = p_order_id AND product_id IS NULL AND unit_price_cents IS DISTINCT FROM 200;
  SELECT coalesce(sum(unit_price_cents * greatest(quantity,0)),0) INTO sub FROM public.order_items WHERE order_id = p_order_id AND product_id IS NOT NULL;
  SELECT coalesce(sum(unit_price_cents * greatest(quantity,0)),0) INTO vpn FROM public.order_items WHERE order_id = p_order_id AND product_id IS NULL;
  IF coalesce(trim(o.discount_code),'') <> '' THEN
    SELECT * INTO c FROM public.discount_codes WHERE lower(code) = lower(trim(o.discount_code)) AND is_active
      AND (user_id IS NULL OR user_id = o.user_id) LIMIT 1;
    IF FOUND AND NOT EXISTS (
      SELECT 1 FROM public.order_items i WHERE i.order_id = p_order_id AND i.product_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.discount_code_products d WHERE d.discount_code_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM public.discount_code_products d WHERE d.discount_code_id = c.id AND d.product_id = i.product_id)) THEN
      IF c.amount_cents IS NOT NULL THEN code_disc := least(sub, c.amount_cents); END IF;
      IF c.percent IS NOT NULL THEN code_disc := round(sub * c.percent / 100.0); END IF;
    END IF;
  END IF;
  SELECT coalesce(-sum(amount_pence),0) INTO ref FROM public.referral_credit_ledger WHERE order_id = p_order_id AND kind = 'spend';
  UPDATE private.orders SET
    total_cents = greatest(0, greatest(0, sub - code_disc) + vpn - ref),
    discount_cents = code_disc + ref,
    updated_at = now()
  WHERE id = p_order_id;
END $$;
REVOKE ALL ON FUNCTION public.reprice_customer_order(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_order_items_customer_reprice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE oid uuid := coalesce(NEW.order_id, OLD.order_id); owner uuid;
BEGIN
  IF auth.uid() IS NULL OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]) THEN
    RETURN NULL;
  END IF;
  SELECT user_id INTO owner FROM private.orders WHERE id = oid;
  IF owner = auth.uid() THEN PERFORM public.reprice_customer_order(oid); END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_order_items_customer_reprice ON public.order_items;
CREATE TRIGGER trg_order_items_customer_reprice AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.tg_order_items_customer_reprice();

CREATE OR REPLACE FUNCTION public.apply_referral_credit(p_order_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
DECLARE o private.orders%ROWTYPE; bal int; use int;
BEGIN
  PERFORM public.reprice_customer_order(p_order_id);
  SELECT * INTO o FROM private.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.paid_at IS NOT NULL OR o.status::text <> 'pending' THEN RAISE EXCEPTION 'Order already paid'; END IF;
  IF EXISTS(SELECT 1 FROM public.referral_credit_ledger WHERE order_id = p_order_id AND kind = 'spend') THEN RETURN 0; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('refcredit:' || auth.uid()::text));
  bal := public.referral_credit_balance(auth.uid());
  use := least(bal, coalesce(o.total_cents,0));
  IF use <= 0 THEN RETURN 0; END IF;
  INSERT INTO public.referral_credit_ledger(user_id, amount_pence, kind, order_id, reason)
  VALUES (auth.uid(), -use, 'spend', p_order_id, 'Used at checkout');
  PERFORM public.reprice_customer_order(p_order_id);
  RETURN use;
END $function$;

CREATE OR REPLACE FUNCTION public.create_my_checkout_link(p_order_id uuid, p_method text)
 RETURNS TABLE(token text, password text) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
DECLARE _o record; _kind text; _m text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF p_method IS NOT NULL AND p_method NOT IN ('square','stripe','wise','crypto') THEN RAISE EXCEPTION 'Pick a payment method'; END IF;
  SELECT id, user_id, customer_type, paid_at, manual_pay_method INTO _o FROM private.orders WHERE id = p_order_id;
  IF NOT FOUND OR _o.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]) THEN
    PERFORM public.reprice_customer_order(p_order_id);
  END IF;
  _m := coalesce(p_method, _o.manual_pay_method, 'square');
  IF _o.paid_at IS NULL AND _o.manual_pay_method IS DISTINCT FROM _m THEN
    UPDATE private.orders SET manual_pay_method = _m WHERE id = p_order_id;
  END IF;
  _kind := CASE WHEN _o.customer_type = 'existing' THEN 'existing' ELSE 'new' END;
  INSERT INTO public.order_checkout_links (order_id, token, password, customer_kind, claimed_by)
  VALUES (p_order_id,
    replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
    upper(substr(replace(gen_random_uuid()::text,'-',''),1,4)) || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,4)) || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,4)),
    _kind, auth.uid())
  ON CONFLICT (order_id) DO NOTHING;
  RETURN QUERY SELECT l.token, l.password FROM public.order_checkout_links l WHERE l.order_id = p_order_id;
END $function$;