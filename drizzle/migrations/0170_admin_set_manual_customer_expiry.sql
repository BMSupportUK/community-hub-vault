CREATE OR REPLACE FUNCTION public.admin_set_manual_customer_expiry(p_order_id uuid, p_expiry_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'private', 'extensions', 'pg_catalog'
AS $function$
DECLARE o private.orders%ROWTYPE;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Only admin can edit subscription expiry'; END IF;
 IF p_expiry_at IS NULL THEN RAISE EXCEPTION 'Enter the subscription expiry date'; END IF;
 SELECT * INTO o FROM private.orders WHERE id=p_order_id;
 IF NOT FOUND OR NOT (o.customer_type='manual' OR o.order_ref LIKE 'MANUAL-%') THEN RAISE EXCEPTION 'Only manual orders without a site account can be edited here'; END IF;
 UPDATE public.order_checkout_links SET subscription_expiry_at=p_expiry_at WHERE order_id=p_order_id;
 UPDATE private.pending_order_credentials SET expiry_at=p_expiry_at WHERE order_id=p_order_id;
 IF NOT EXISTS(SELECT 1 FROM public.order_checkout_links WHERE order_id=p_order_id)
    AND NOT EXISTS(SELECT 1 FROM private.pending_order_credentials WHERE order_id=p_order_id) THEN
  INSERT INTO private.pending_order_credentials(order_id,app_login_name,account_type,expiry_at,created_by)
  VALUES(p_order_id,coalesce(o.existing_username,o.shipping_name,''),'single',p_expiry_at,auth.uid());
 END IF;
END $function$;
REVOKE EXECUTE ON FUNCTION public.admin_set_manual_customer_expiry(uuid,timestamptz) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_set_manual_customer_expiry(uuid,timestamptz) TO authenticated;