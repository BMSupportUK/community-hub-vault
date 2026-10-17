CREATE OR REPLACE FUNCTION public.staff_manual_order_previous_login(p_order_id uuid)
RETURNS TABLE(app_login_name text, password text, account_type text, expiry_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','private','extensions','pg_catalog' AS $$
DECLARE v_o record; v_group uuid;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','management','staff']::public.app_role[]) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT o.id, o.shipping_name, o.existing_username, o.created_at INTO v_o FROM private.orders o WHERE o.id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT l.renewal_customer_id INTO v_group FROM public.order_checkout_links l WHERE l.order_id = p_order_id;
  RETURN QUERY
  SELECT pc.app_login_name, private.app_decrypt(pc.password_enc), pc.account_type, coalesce(lp.subscription_expiry_at, pc.expiry_at)
    FROM private.orders p
    JOIN private.pending_order_credentials pc ON pc.order_id = p.id
    LEFT JOIN public.order_checkout_links lp ON lp.order_id = p.id
   WHERE p.id <> v_o.id AND p.paid_at IS NOT NULL AND p.status <> 'cancelled'
     AND (p.customer_type = 'manual' OR p.order_ref LIKE 'MANUAL-%')
     AND (
       (v_group IS NOT NULL AND (p.id = v_group OR lp.renewal_customer_id = v_group))
       OR (coalesce(btrim(v_o.shipping_name),'') <> '' AND lower(btrim(p.shipping_name)) = lower(btrim(v_o.shipping_name)))
       OR (coalesce(btrim(v_o.existing_username),'') <> '' AND lower(btrim(pc.app_login_name)) = lower(btrim(v_o.existing_username)))
     )
   ORDER BY (v_group IS NOT NULL AND (p.id = v_group OR lp.renewal_customer_id = v_group)) DESC, p.created_at DESC
   LIMIT 1;
END; $$;
REVOKE ALL ON FUNCTION public.staff_manual_order_previous_login(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.staff_manual_order_previous_login(uuid) TO authenticated;