CREATE OR REPLACE FUNCTION public.admin_order_site_users()
RETURNS TABLE(id uuid, username text, display_name text, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Only admin and management can select site users'; END IF;
 RETURN QUERY SELECT p.id,p.username::text,p.display_name::text,u.email::text FROM public.profiles p JOIN auth.users u ON u.id=p.id
 WHERE u.email_confirmed_at IS NOT NULL AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role::text IN ('admin','management','staff','moderator','member','subscriber','nonsubscriber'))
 AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role::text IN ('banned','rejected','pending'))
 AND NOT EXISTS(SELECT 1 FROM public.temporary_accounts t WHERE t.user_id=p.id)
 AND NOT public.admin_customer_is_hidden(p.id,p.username::text,p.display_name::text)
 ORDER BY lower(coalesce(p.username::text,p.display_name::text,''));
END $$;
REVOKE ALL ON FUNCTION public.admin_order_site_users() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_order_site_users() TO authenticated,service_role;

DO $patch$
DECLARE d text;
BEGIN
 d:=pg_get_functiondef('public.admin_create_manual_order_v2(text,jsonb,text,text,integer,text,timestamptz)'::regprocedure);
 d:=replace(d,'IF NOT public.has_role(auth.uid(), ''admin'') THEN','IF NOT public.has_any_role(auth.uid(), ARRAY[''admin'',''management'']::public.app_role[]) THEN');
 EXECUTE d;
 d:=pg_get_functiondef('public.admin_create_manual_order_v3(text,jsonb,text,text,integer,text,timestamptz,uuid,uuid)'::regprocedure);
 d:=replace(d,'IF NOT public.has_role(auth.uid(),''admin'') THEN','IF NOT public.has_any_role(auth.uid(),ARRAY[''admin'',''management'']::public.app_role[]) THEN');
 EXECUTE d;
END $patch$;

CREATE OR REPLACE FUNCTION public.admin_create_manual_order_v5(_customer_name text,_items jsonb,_method text,_email text DEFAULT NULL,_discount_cents integer DEFAULT 0,_customer_kind text DEFAULT 'new',_created_at timestamptz DEFAULT NULL,_customer_id uuid DEFAULT NULL,_account_id uuid DEFAULT NULL,_skip_registration boolean DEFAULT false,_site_user_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE oid uuid; target record; total integer:=0; it jsonb; product record; quantity integer; disc integer; summary text:='Order summary:'; stamp timestamptz:=coalesce(_created_at,now());
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Only admin and management can add orders'; END IF;
 IF _site_user_id IS NULL THEN
  IF public.has_role(auth.uid(),'admin') THEN RETURN public.admin_create_manual_order_v4(_customer_name,_items,_method,_email,_discount_cents,_customer_kind,_created_at,_customer_id,_account_id,_skip_registration); END IF;
  IF _skip_registration IS DISTINCT FROM false THEN RAISE EXCEPTION 'Only admin can change account creation'; END IF;
  RETURN public.admin_create_manual_order_v3(_customer_name,_items,_method,_email,_discount_cents,_customer_kind,_created_at,_customer_id,_account_id);
 END IF;
 IF _customer_id IS NOT NULL OR _account_id IS NOT NULL OR _skip_registration IS DISTINCT FROM false THEN RAISE EXCEPTION 'Site orders cannot use manual customer or registration options'; END IF;
 SELECT * INTO target FROM public.admin_order_site_users() WHERE id=_site_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose an active site user'; END IF;
 IF jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items)=0 THEN RAISE EXCEPTION 'Pick at least one product'; END IF;
 IF _method IS NULL OR _method NOT IN ('square','stripe','cash','wise') THEN RAISE EXCEPTION 'Pick a payment method'; END IF;
 IF _customer_kind IS NULL OR _customer_kind NOT IN ('new','existing') THEN RAISE EXCEPTION 'Pick new or existing customer'; END IF;
 IF _created_at > now()+interval '5 minutes' THEN RAISE EXCEPTION 'Order date cannot be in the future'; END IF;
 INSERT INTO private.orders(user_id,status,total_cents,shipping_name,customer_type,notes,manual_pay_method,created_at,email_enc)
 VALUES(target.id,'pending',0,coalesce(nullif(trim(_customer_name),''),target.display_name,target.username),_customer_kind,'Manually added by admin or management',_method,stamp,public.app_encrypt(lower(target.email))) RETURNING id INTO oid;
 FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
  SELECT id,name,price_cents INTO product FROM public.products WHERE id=(it->>'product_id')::uuid AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown or inactive product'; END IF;
  quantity:=(it->>'quantity')::integer;
  IF quantity IS NULL OR quantity<1 OR quantity>100 THEN RAISE EXCEPTION 'Quantity must be between 1 and 100'; END IF;
  INSERT INTO public.order_items(order_id,product_id,product_name,unit_price_cents,quantity) VALUES(oid,product.id,product.name,product.price_cents,quantity);
  total:=total+product.price_cents*quantity;
  summary:=summary||E'\n'||quantity||' x '||product.name||' — £'||to_char(product.price_cents*quantity/100.0,'FM999990.00');
 END LOOP;
 disc:=greatest(0,least(coalesce(_discount_cents,0),total));
 UPDATE private.orders SET total_cents=total-disc,discount_cents=disc WHERE id=oid;
 INSERT INTO public.order_checkout_links(order_id,token,password,customer_kind,claimed_by)
 VALUES(oid,replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),upper(substr(replace(gen_random_uuid()::text,'-',''),1,4))||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4))||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4)),_customer_kind,target.id);
 IF disc>0 THEN summary:=summary||E'\nDiscount: -£'||to_char(disc/100.0,'FM999990.00'); END IF;
 summary:=summary||E'\nTotal to pay: £'||to_char((total-disc)/100.0,'FM999990.00');
 INSERT INTO public.checkout_chat_messages(order_id,sender,staff_id,content) VALUES(oid,'staff',auth.uid(),summary);
 RETURN oid;
END $$;
REVOKE ALL ON FUNCTION public.admin_create_manual_order_v5(text,jsonb,text,text,integer,text,timestamptz,uuid,uuid,boolean,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_create_manual_order_v5(text,jsonb,text,text,integer,text,timestamptz,uuid,uuid,boolean,uuid) TO authenticated,service_role;