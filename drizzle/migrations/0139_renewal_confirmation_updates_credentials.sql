ALTER TABLE public.order_checkout_links ADD COLUMN IF NOT EXISTS renewal_applied_at timestamptz, ADD COLUMN IF NOT EXISTS renewal_credential_id uuid;

CREATE OR REPLACE FUNCTION public.order_subscription_months(p_order_id uuid)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public,pg_catalog AS $$
DECLARE item record; name text; matched text[]; term integer; total integer := 0;
BEGIN
 IF NOT public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 FOR item IN SELECT product_name,quantity FROM public.order_items WHERE order_id=p_order_id LOOP
  name := lower(coalesce(item.product_name,'')); term := 0;
  matched := regexp_match(name, '([0-9]+)\s*(year|yr)s?\y');
  IF matched IS NOT NULL THEN term := matched[1]::integer * 12;
  ELSIF name ~ '\y(a|one)\s*year\y' THEN term := 12;
  ELSE
   matched := regexp_match(name, '([0-9]+)\s*(month|mth|mo)s?\y');
   IF matched IS NOT NULL THEN term := matched[1]::integer;
   ELSE
    matched := regexp_match(name, '\y(one|two|three|six|twelve)\s*(month|mth)s?\y');
    IF matched IS NOT NULL THEN term := CASE matched[1] WHEN 'one' THEN 1 WHEN 'two' THEN 2 WHEN 'three' THEN 3 WHEN 'six' THEN 6 WHEN 'twelve' THEN 12 END; END IF;
   END IF;
  END IF;
  total := total + term * greatest(coalesce(item.quantity,1),1);
 END LOOP;
 RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.order_subscription_months(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.order_subscription_months(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_account_setup(p_order_id uuid,p_done boolean)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,private,pg_catalog AS $$
DECLARE o private.orders%ROWTYPE; link public.order_checkout_links%ROWTYPE; target uuid; matches integer; months integer; stamp timestamptz;
BEGIN
 IF NOT public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT * INTO o FROM private.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
 SELECT * INTO link FROM public.order_checkout_links WHERE order_id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'This order has no secure checkout page'; END IF;
 IF p_done AND link.customer_kind='existing' AND link.account_setup_at IS NULL AND link.renewal_applied_at IS NULL THEN
  IF o.paid_at IS NULL OR o.status::text='cancelled' THEN RAISE EXCEPTION 'A renewal must be paid and not cancelled'; END IF;
  IF o.user_id IS NULL THEN RAISE EXCEPTION 'Link this order to the customer account before extending their subscription'; END IF;
  SELECT count(*),min(c.id::text)::uuid INTO matches,target FROM private.app_credentials c WHERE c.owner_id=o.user_id AND (CASE WHEN nullif(trim(o.existing_username),'') IS NOT NULL THEN lower(trim(c.app_login_name))=lower(trim(o.existing_username)) ELSE true END);
  IF matches=0 THEN RAISE EXCEPTION 'This customer has no matching saved service account to renew'; END IF;
  IF matches>1 THEN RAISE EXCEPTION 'Choose the account using Save renewal expiry before confirming the extension'; END IF;
  PERFORM 1 FROM private.app_credentials WHERE id=target FOR UPDATE;
  -- An expiry already saved for this order must not be extended twice.
  IF NOT EXISTS(SELECT 1 FROM private.app_credentials WHERE id=target AND order_id=p_order_id) THEN
   months := public.order_subscription_months(p_order_id);
   IF months<=0 THEN RAISE EXCEPTION 'The subscription length could not be read from this sale; save the renewal expiry first'; END IF;
   UPDATE private.app_credentials SET expiry_at=greatest(coalesce(expiry_at,now()),now())+make_interval(months=>months),order_id=p_order_id,updated_at=now() WHERE id=target;
  END IF;
  UPDATE public.order_checkout_links SET renewal_applied_at=now(),renewal_credential_id=target WHERE order_id=p_order_id;
 END IF;
 stamp := CASE WHEN p_done THEN coalesce(link.account_setup_at,CASE WHEN o.customer_type='manual' THEN o.created_at ELSE now() END) ELSE NULL END;
 UPDATE public.order_checkout_links SET account_setup_at=stamp,account_setup_by=CASE WHEN p_done THEN auth.uid() ELSE NULL END WHERE order_id=p_order_id;
 RETURN stamp;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_account_setup(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_account_setup(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_set_order_credential_expiry(p_order_id uuid,p_credential_id uuid,p_expiry timestamptz)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,private,pg_catalog AS $$
DECLARE o private.orders%ROWTYPE;
BEGIN
 IF NOT public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF p_expiry IS NULL OR p_expiry<=now() THEN RAISE EXCEPTION 'Expiry must be in the future'; END IF;
 SELECT * INTO o FROM private.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
 IF o.paid_at IS NULL OR o.status::text='cancelled' THEN RAISE EXCEPTION 'The order must be paid and not cancelled'; END IF;
 PERFORM 1 FROM public.order_checkout_links WHERE order_id=p_order_id FOR UPDATE;
 IF p_credential_id IS NOT NULL THEN
  UPDATE private.app_credentials SET expiry_at=p_expiry,order_id=p_order_id,updated_at=now() WHERE id=p_credential_id AND owner_id=o.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'That account does not belong to this customer'; END IF;
 ELSE
  UPDATE private.pending_order_credentials SET expiry_at=p_expiry WHERE order_id=p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No saved account details for this order'; END IF;
 END IF;
 UPDATE public.order_checkout_links SET renewal_applied_at=now(),renewal_credential_id=p_credential_id WHERE order_id=p_order_id AND customer_kind='existing';
 RETURN p_expiry;
END $$;
REVOKE ALL ON FUNCTION public.staff_set_order_credential_expiry(uuid,uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_set_order_credential_expiry(uuid,uuid,timestamptz) TO authenticated;