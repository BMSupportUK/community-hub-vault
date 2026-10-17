ALTER TABLE public.order_checkout_links ADD COLUMN IF NOT EXISTS renewal_customer_id uuid, ADD COLUMN IF NOT EXISTS renewal_account_id uuid, ADD COLUMN IF NOT EXISTS subscription_expiry_at timestamptz;
DO $patch$
DECLARE d text;
BEGIN
 d:=pg_get_functiondef('public.admin_customer_subscriptions()'::regprocedure);
 d:=replace(d,'coalesce(CASE WHEN o.customer_type=''manual'' THEN coalesce(l.claimed_by,(SELECT u.id FROM auth.users u WHERE lower(u.email)=lower(private.app_decrypt(o.email_enc)) LIMIT 1)) ELSE o.user_id END,'||E'\n'||'   (SELECT c.owner_id FROM private.app_credentials c WHERE c.order_id=o.id LIMIT 1),o.id)','CASE WHEN o.customer_type=''manual'' OR o.order_ref LIKE ''MANUAL-%'' THEN coalesce(l.renewal_customer_id,o.id) ELSE coalesce(o.user_id,(SELECT c.owner_id FROM private.app_credentials c WHERE c.order_id=o.id LIMIT 1),o.id) END');
 d:=replace(d,'UNION ALL'||E'\n'||'  SELECT paid.customer_id,coalesce(pc.app_login_name,paid.existing_username),paid.shipping_name,false','UNION ALL'||E'\n'||'  (SELECT DISTINCT ON (paid.customer_id) paid.customer_id,coalesce(pc.app_login_name,paid.existing_username),paid.shipping_name,false');
 d:=replace(d,'WHERE paid.customer_id=paid.id AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=paid.customer_id)','WHERE NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=paid.customer_id) ORDER BY paid.customer_id,paid.created_at,paid.id)');
 d:=replace(d,'SELECT c.owner_id customer_id,c.id,c.app_login_name,c.expiry_at FROM private.app_credentials c','SELECT c.owner_id customer_id,c.id,c.app_login_name,c.expiry_at FROM private.app_credentials c WHERE NOT EXISTS(SELECT 1 FROM paid WHERE paid.id=c.order_id AND (paid.customer_type=''manual'' OR paid.order_ref LIKE ''MANUAL-%''))');
 d:=replace(d,'SELECT paid.customer_id,paid.id,c.app_login_name,c.expiry_at FROM paid JOIN private.pending_order_credentials c ON c.order_id=paid.id','SELECT paid.customer_id,paid.id,coalesce(c.app_login_name,cr.app_login_name,paid.existing_username,paid.shipping_name),coalesce(l.subscription_expiry_at,c.expiry_at,cr.expiry_at,CASE WHEN term.months>0 THEN paid.created_at+make_interval(months=>term.months) END) FROM paid LEFT JOIN private.pending_order_credentials c ON c.order_id=paid.id LEFT JOIN public.order_checkout_links l ON l.order_id=paid.id LEFT JOIN LATERAL (SELECT app_login_name,expiry_at FROM private.app_credentials WHERE order_id=paid.id LIMIT 1) cr ON true LEFT JOIN LATERAL (SELECT sum(public.package_item_months(i.product_name)*greatest(coalesce(i.quantity,1),1))::int months FROM public.order_items i WHERE i.order_id=paid.id) term ON true WHERE l.renewal_account_id IS NULL AND (paid.customer_type=''manual'' OR paid.order_ref LIKE ''MANUAL-%'' OR c.order_id IS NOT NULL)');
 EXECUTE d;
 d:=pg_get_functiondef('public.admin_customer_subscription_details()'::regprocedure);
 EXECUTE replace(d,'l.renewal_credential_id=(ac.value->>''id'')::uuid','l.renewal_account_id=(ac.value->>''id'')::uuid OR l.renewal_credential_id=(ac.value->>''id'')::uuid');
 d:=pg_get_functiondef('public.admin_set_account_setup(uuid,boolean)'::regprocedure);
 EXECUTE replace(d,'public.admin_set_account_setup(', 'private.admin_set_account_setup_legacy(');
 d:=pg_get_functiondef('public.staff_set_order_credential_expiry(uuid,uuid,timestamptz)'::regprocedure);
 EXECUTE replace(d,'public.staff_set_order_credential_expiry(', 'private.staff_set_order_credential_expiry_legacy(');
END $patch$;
REVOKE ALL ON FUNCTION private.admin_set_account_setup_legacy(uuid,boolean),private.staff_set_order_credential_expiry_legacy(uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.admin_create_manual_order_v3(_customer_name text,_items jsonb,_method text,_email text DEFAULT NULL,_discount_cents integer DEFAULT 0,_customer_kind text DEFAULT 'new',_created_at timestamptz DEFAULT NULL,_customer_id uuid DEFAULT NULL,_account_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE c jsonb; a jsonb; oid uuid;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _customer_kind='existing' THEN
  SELECT value INTO c FROM jsonb_array_elements(public.admin_customer_subscription_list()) WHERE (value->>'userId')::uuid=_customer_id AND NOT coalesce((value->>'hasSiteAccount')::boolean,false);
  SELECT value INTO a FROM jsonb_array_elements(coalesce(c->'accounts','[]'::jsonb)) WHERE (value->>'id')::uuid=_account_id;
  IF c IS NULL OR a IS NULL THEN RAISE EXCEPTION 'Choose the manual customer and account to renew'; END IF;
 ELSIF _customer_id IS NOT NULL OR _account_id IS NOT NULL THEN RAISE EXCEPTION 'Only renewals can be linked to existing accounts'; END IF;
 oid:=public.admin_create_manual_order_v2(_customer_name,_items,_method,_email,_discount_cents,_customer_kind,_created_at);
 IF a IS NOT NULL THEN
  UPDATE public.order_checkout_links SET renewal_customer_id=_customer_id,renewal_account_id=_account_id WHERE order_id=oid;
  UPDATE private.orders SET existing_username=a->>'login' WHERE id=oid;
 END IF;
 RETURN oid;
END $$;
REVOKE ALL ON FUNCTION public.admin_create_manual_order_v3(text,jsonb,text,text,int,text,timestamptz,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_create_manual_order_v3(text,jsonb,text,text,int,text,timestamptz,uuid,uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.staff_order_linked_renewal_account(p_order_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,private AS $$
DECLARE l public.order_checkout_links%ROWTYPE; a jsonb;
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT * INTO l FROM public.order_checkout_links WHERE order_id=p_order_id;
 IF l.renewal_account_id IS NULL THEN RETURN NULL; END IF;
 SELECT ac.value INTO a FROM jsonb_array_elements(public.admin_customer_subscription_list()) c CROSS JOIN LATERAL jsonb_array_elements(c.value->'accounts') ac WHERE (c.value->>'userId')::uuid=l.renewal_customer_id AND (ac.value->>'id')::uuid=l.renewal_account_id AND NOT coalesce((c.value->>'hasSiteAccount')::boolean,false);
 IF a IS NULL THEN RAISE EXCEPTION 'Linked manual subscription account not found'; END IF;
 RETURN jsonb_build_object('id',a->>'id','app_login_name',a->>'login','expiry_at',a->'expiresAt','account_number',NULL,'account_type',NULL);
END $$;
REVOKE ALL ON FUNCTION public.staff_order_linked_renewal_account(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_order_linked_renewal_account(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.staff_set_order_credential_expiry(p_order_id uuid,p_credential_id uuid,p_expiry timestamptz) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE l public.order_checkout_links%ROWTYPE; o private.orders%ROWTYPE;
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT * INTO o FROM private.orders WHERE id=p_order_id FOR UPDATE;
 SELECT * INTO l FROM public.order_checkout_links WHERE order_id=p_order_id FOR UPDATE;
 IF l.renewal_account_id IS NULL THEN RETURN private.staff_set_order_credential_expiry_legacy(p_order_id,p_credential_id,p_expiry); END IF;
 IF p_credential_id IS DISTINCT FROM l.renewal_account_id THEN RAISE EXCEPTION 'That account does not belong to this renewal'; END IF;
 IF o.paid_at IS NULL OR o.status::text='cancelled' THEN RAISE EXCEPTION 'The order must be paid and not cancelled'; END IF;
 IF p_expiry IS NULL OR p_expiry<=now() THEN RAISE EXCEPTION 'Expiry must be in the future'; END IF;
 IF l.renewal_applied_at IS NOT NULL THEN RAISE EXCEPTION 'This renewal has already been applied'; END IF;
 PERFORM public.staff_order_linked_renewal_account(p_order_id);
 UPDATE public.order_checkout_links SET subscription_expiry_at=p_expiry WHERE order_id=l.renewal_account_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original manual account not found'; END IF;
 UPDATE private.pending_order_credentials SET expiry_at=p_expiry WHERE order_id=l.renewal_account_id;
 UPDATE public.order_checkout_links SET subscription_expiry_at=p_expiry,renewal_applied_at=now(),renewal_credential_id=p_credential_id WHERE order_id=p_order_id;
 RETURN p_expiry;
END $$;
CREATE OR REPLACE FUNCTION public.admin_set_account_setup(p_order_id uuid,p_done boolean) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE l public.order_checkout_links%ROWTYPE; a jsonb; months int; stamp timestamptz;
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 PERFORM 1 FROM private.orders WHERE id=p_order_id FOR UPDATE;
 SELECT * INTO l FROM public.order_checkout_links WHERE order_id=p_order_id FOR UPDATE;
 IF l.renewal_account_id IS NULL THEN RETURN private.admin_set_account_setup_legacy(p_order_id,p_done); END IF;
 IF p_done AND l.renewal_applied_at IS NULL THEN
  a:=public.staff_order_linked_renewal_account(p_order_id);
  months:=public.order_subscription_months(p_order_id);
  IF months<=0 THEN RAISE EXCEPTION 'The subscription length could not be read'; END IF;
  PERFORM public.staff_set_order_credential_expiry(p_order_id,l.renewal_account_id,greatest(coalesce((a->>'expiry_at')::timestamptz,now()),now())+make_interval(months=>months));
 END IF;
 stamp:=CASE WHEN p_done THEN coalesce(l.account_setup_at,now()) ELSE NULL END;
 UPDATE public.order_checkout_links SET account_setup_at=stamp,account_setup_by=CASE WHEN p_done THEN auth.uid() ELSE NULL END WHERE order_id=p_order_id;
 RETURN stamp;
END $$;
CREATE OR REPLACE FUNCTION public.admin_manual_customer_orders() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,private AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'ref',o.order_ref,'name',o.shipping_name,'createdAt',o.created_at,'paidAt',o.paid_at,'customerId',coalesce(l.renewal_customer_id,o.id),'accountId',l.renewal_account_id,'kind',l.customer_kind) ORDER BY o.created_at DESC),'[]'::jsonb) FROM private.orders o JOIN public.order_checkout_links l ON l.order_id=o.id WHERE (o.customer_type='manual' OR o.order_ref LIKE 'MANUAL-%') AND o.status::text<>'cancelled');
END $$;
REVOKE ALL ON FUNCTION public.admin_manual_customer_orders() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_manual_customer_orders() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.admin_group_manual_customer_order(p_order_id uuid,p_customer_id uuid,p_account_id uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE c jsonb; a jsonb; o private.orders%ROWTYPE; l public.order_checkout_links%ROWTYPE; months int; exp timestamptz;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Only admin can group manual orders'; END IF;
 SELECT value INTO c FROM jsonb_array_elements(public.admin_customer_subscription_list()) WHERE (value->>'userId')::uuid=p_customer_id AND NOT coalesce((value->>'hasSiteAccount')::boolean,false);
 IF c IS NULL THEN RAISE EXCEPTION 'Choose a manual customer, not a site account'; END IF;
 SELECT * INTO o FROM private.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR NOT (o.customer_type='manual' OR o.order_ref LIKE 'MANUAL-%') THEN RAISE EXCEPTION 'Only manual orders can be grouped'; END IF;
 SELECT * INTO l FROM public.order_checkout_links WHERE order_id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Manual checkout link not found'; END IF;
 IF p_account_id IS NOT NULL THEN
  IF p_account_id=p_order_id THEN RAISE EXCEPTION 'Choose a different original account'; END IF;
  SELECT value INTO a FROM jsonb_array_elements(c->'accounts') WHERE (value->>'id')::uuid=p_account_id;
  IF a IS NULL THEN RAISE EXCEPTION 'Manual customer account not found'; END IF;
  IF l.renewal_applied_at IS NOT NULL AND (l.renewal_account_id IS DISTINCT FROM p_account_id OR l.renewal_customer_id IS DISTINCT FROM p_customer_id) THEN RAISE EXCEPTION 'An applied renewal cannot be reassigned'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.order_checkout_links WHERE renewal_account_id=p_order_id) THEN RAISE EXCEPTION 'Group the original order before its linked renewals'; END IF;
 UPDATE public.order_checkout_links SET renewal_customer_id=p_customer_id,renewal_account_id=p_account_id,customer_kind=CASE WHEN p_account_id IS NOT NULL THEN 'existing' ELSE customer_kind END WHERE order_id=p_order_id;
 IF a IS NOT NULL THEN
  UPDATE private.orders SET existing_username=a->>'login' WHERE id=p_order_id;
  IF o.paid_at IS NOT NULL AND l.renewal_applied_at IS NULL THEN
   months:=public.order_subscription_months(p_order_id);
   IF months<=0 THEN RAISE EXCEPTION 'The subscription length could not be read'; END IF;
   exp:=greatest(coalesce((a->>'expiresAt')::timestamptz,o.created_at),o.created_at)+make_interval(months=>months);
   UPDATE public.order_checkout_links SET subscription_expiry_at=exp WHERE order_id=p_account_id;
   UPDATE private.pending_order_credentials SET expiry_at=exp WHERE order_id=p_account_id;
   UPDATE public.order_checkout_links SET subscription_expiry_at=exp,renewal_applied_at=now(),renewal_credential_id=p_account_id WHERE order_id=p_order_id;
  END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_group_manual_customer_order(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_group_manual_customer_order(uuid,uuid,uuid) TO authenticated,service_role;