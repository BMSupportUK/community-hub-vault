ALTER TABLE public.manual_name_customers ADD COLUMN IF NOT EXISTS email text;
COMMENT ON COLUMN public.manual_name_customers.email IS 'Manual customer contact only; adding a customer does not create an Auth account.';
CREATE OR REPLACE FUNCTION public.admin_manual_customer_checkout_options(p_customer_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,private AS $$
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=p_customer_id) THEN RAISE EXCEPTION 'Choose a manual customer'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'ref',o.order_ref,'name',o.shipping_name,'linked',coalesce(l.renewal_customer_id,o.id)=p_customer_id) ORDER BY o.created_at DESC),'[]'::jsonb) FROM private.orders o JOIN public.order_checkout_links l ON l.order_id=o.id WHERE (o.customer_type='manual' OR o.order_ref LIKE 'MANUAL-%') AND o.status::text<>'cancelled' AND l.claimed_by IS NULL AND (coalesce(l.renewal_customer_id,o.id)=p_customer_id OR (l.renewal_customer_id IS NULL AND l.renewal_account_id IS NULL AND l.renewal_applied_at IS NULL)));
END $$;
REVOKE ALL ON FUNCTION public.admin_manual_customer_checkout_options(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_manual_customer_checkout_options(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.admin_manual_customer_checkout_email(p_customer_id uuid,p_order_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE o private.orders%ROWTYPE; l public.order_checkout_links%ROWTYPE; v_email text; v_name text;
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.admin_customer_subscription_list()) c WHERE (c->>'userId')::uuid=p_customer_id AND NOT coalesce((c->>'hasSiteAccount')::boolean,false)) THEN RAISE EXCEPTION 'Manual customer not found'; END IF;
 SELECT * INTO o FROM private.orders WHERE id=p_order_id FOR UPDATE;
 SELECT * INTO l FROM public.order_checkout_links WHERE order_id=p_order_id FOR UPDATE;
 IF o.id IS NULL OR l.order_id IS NULL OR o.status::text='cancelled' OR NOT(o.customer_type='manual' OR o.order_ref LIKE 'MANUAL-%') OR l.claimed_by IS NOT NULL THEN RAISE EXCEPTION 'Manual checkout unavailable'; END IF;
 IF coalesce(l.renewal_customer_id,o.id)<>p_customer_id AND (l.renewal_customer_id IS NOT NULL OR l.renewal_account_id IS NOT NULL OR l.renewal_applied_at IS NOT NULL) THEN RAISE EXCEPTION 'Order belongs to another customer'; END IF;
 SELECT email,name INTO v_email,v_name FROM public.manual_name_customers WHERE id=p_customer_id;
 IF NOT FOUND THEN
 SELECT original.email,original.shipping_name INTO v_email,v_name FROM private.orders original WHERE original.id=p_customer_id;
 END IF;
 IF nullif(trim(v_email),'') IS NULL THEN RAISE EXCEPTION 'Add an email to this manual customer first'; END IF;
 UPDATE public.order_checkout_links SET renewal_customer_id=p_customer_id WHERE order_id=p_order_id;
 UPDATE private.orders SET email=v_email WHERE id=p_order_id;
 RETURN jsonb_build_object('email',v_email,'name',v_name,'ref',o.order_ref,'token',l.token,'password',l.password);
END $$;
REVOKE ALL ON FUNCTION public.admin_manual_customer_checkout_email(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_manual_customer_checkout_email(uuid,uuid) TO authenticated,service_role;