CREATE OR REPLACE FUNCTION public.admin_manual_customer_checkout_email(p_customer_id uuid, p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE o private.orders%ROWTYPE; l public.order_checkout_links%ROWTYPE; v_email text; v_name text; v_cust jsonb; v_exp text;
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT c INTO v_cust FROM jsonb_array_elements(public.admin_customer_subscription_list()) c WHERE (c->>'userId')::uuid=p_customer_id AND NOT coalesce((c->>'hasSiteAccount')::boolean,false) LIMIT 1;
 IF v_cust IS NULL THEN RAISE EXCEPTION 'Manual customer not found'; END IF;
 SELECT * INTO o FROM private.orders WHERE id=p_order_id FOR UPDATE;
 SELECT * INTO l FROM public.order_checkout_links WHERE order_id=p_order_id FOR UPDATE;
 IF o.id IS NULL OR l.order_id IS NULL OR o.status::text='cancelled' OR NOT(o.customer_type='manual' OR o.order_ref LIKE 'MANUAL-%') OR l.claimed_by IS NOT NULL THEN RAISE EXCEPTION 'Manual checkout unavailable'; END IF;
 IF o.paid_at IS NOT NULL OR o.status::text IN ('paid','completed') THEN RAISE EXCEPTION 'This order is already paid. Choose an unpaid order'; END IF;
 IF coalesce(l.renewal_customer_id,o.id)<>p_customer_id AND (l.renewal_customer_id IS NOT NULL OR l.renewal_account_id IS NOT NULL OR l.renewal_applied_at IS NOT NULL) THEN RAISE EXCEPTION 'Order belongs to another customer'; END IF;
 SELECT email,name INTO v_email,v_name FROM public.manual_name_customers WHERE id=p_customer_id;
 IF NOT FOUND THEN
 SELECT private.app_decrypt(original.email_enc),original.shipping_name INTO v_email,v_name FROM private.orders original WHERE original.id=p_customer_id;
 END IF;
 IF nullif(trim(v_email),'') IS NULL THEN RAISE EXCEPTION 'Add an email to this manual customer first'; END IF;
 -- Current expiry: the account being renewed, else the latest on the customer.
 SELECT a->>'expiresAt' INTO v_exp FROM jsonb_array_elements(coalesce(v_cust->'accounts','[]'::jsonb)) a
  WHERE nullif(a->>'expiresAt','') IS NOT NULL AND (l.renewal_account_id IS NULL OR a->>'id'=l.renewal_account_id::text)
  ORDER BY (a->>'expiresAt')::timestamptz DESC LIMIT 1;
 v_exp := coalesce(v_exp, nullif(v_cust->>'manualExpiryDate',''));
 UPDATE public.order_checkout_links SET renewal_customer_id=p_customer_id WHERE order_id=p_order_id;
 UPDATE private.orders SET email_enc=public.app_encrypt(v_email) WHERE id=p_order_id;
 RETURN jsonb_build_object('email',v_email,'name',v_name,'ref',o.order_ref,'token',l.token,'password',l.password,'renewal',l.customer_kind='existing','expiresAt',v_exp);
END $function$;