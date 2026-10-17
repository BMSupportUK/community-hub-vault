CREATE OR REPLACE FUNCTION public.admin_set_manual_customer_login(p_order_id uuid, p_login_name text, p_password text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private','extensions','pg_catalog' AS $$
DECLARE o private.orders%ROWTYPE; l public.order_checkout_links%ROWTYPE; months int; exp timestamptz;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Only admin can edit login details'; END IF;
 IF coalesce(btrim(p_login_name),'')='' THEN RAISE EXCEPTION 'Enter the login name'; END IF;
 SELECT * INTO o FROM private.orders WHERE id=p_order_id;
 IF NOT FOUND OR NOT (o.customer_type='manual' OR o.order_ref LIKE 'MANUAL-%') THEN RAISE EXCEPTION 'Only manual orders without a site account can be edited here'; END IF;
 IF EXISTS(SELECT 1 FROM private.pending_order_credentials WHERE order_id=p_order_id) THEN
  UPDATE private.pending_order_credentials SET app_login_name=btrim(p_login_name),
   password_enc=CASE WHEN coalesce(p_password,'')<>'' THEN public.app_encrypt(p_password) ELSE password_enc END
  WHERE order_id=p_order_id;
 ELSE
  SELECT * INTO l FROM public.order_checkout_links WHERE order_id=p_order_id;
  months:=public.order_subscription_months(p_order_id);
  exp:=coalesce(l.subscription_expiry_at,(SELECT expiry_at FROM private.app_credentials WHERE order_id=p_order_id LIMIT 1),CASE WHEN months>0 THEN o.created_at+make_interval(months=>months) END,now());
  INSERT INTO private.pending_order_credentials(order_id,app_login_name,password_enc,account_type,expiry_at,created_by)
  VALUES(p_order_id,btrim(p_login_name),CASE WHEN coalesce(p_password,'')<>'' THEN public.app_encrypt(p_password) END,'single',exp,auth.uid());
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_manual_customer_login(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_manual_customer_login(uuid,text,text) TO authenticated,service_role;