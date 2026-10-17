CREATE TABLE public.customer_account_packages(customer_id uuid NOT NULL,account_id uuid NOT NULL,product_id uuid NOT NULL REFERENCES public.products(id),allocated_by uuid NOT NULL,allocated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(customer_id,account_id));
GRANT SELECT ON public.customer_account_packages TO authenticated;
GRANT ALL ON public.customer_account_packages TO service_role;
ALTER TABLE public.customer_account_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_account_packages_read ON public.customer_account_packages FOR SELECT TO authenticated USING(public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]));
CREATE FUNCTION public.admin_allocate_customer_account_package(p_customer_id uuid,p_account_id uuid,p_product_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin']::public.app_role[]) THEN RAISE EXCEPTION 'Only admin can allocate packages'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.admin_customer_subscription_details()) c CROSS JOIN LATERAL jsonb_array_elements(coalesce(c->'accounts','[]'::jsonb)) a WHERE (c->>'userId')::uuid=p_customer_id AND (a->>'id')::uuid=p_account_id) THEN RAISE EXCEPTION 'Customer account not found'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=p_product_id AND is_active) THEN RAISE EXCEPTION 'Choose an available package'; END IF;
 INSERT INTO public.customer_account_packages(customer_id,account_id,product_id,allocated_by) VALUES(p_customer_id,p_account_id,p_product_id,auth.uid()) ON CONFLICT(customer_id,account_id) DO UPDATE SET product_id=excluded.product_id,allocated_by=excluded.allocated_by,allocated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.admin_allocate_customer_account_package(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_allocate_customer_account_package(uuid,uuid,uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.admin_customer_subscription_list() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,private AS $$
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(c.value || jsonb_build_object(
 'username',CASE WHEN coalesce((c.value->>'hasSiteAccount')::boolean,false) THEN c.value->>'username' ELSE coalesce(u.username,c.value->>'username') END,
 'accounts',coalesce((SELECT jsonb_agg(ac.value || jsonb_build_object('package',coalesce(p.name,recorded.package,CASE WHEN jsonb_array_length(c.value->'accounts')=1 THEN c.value->>'package' END),'packageProductId',a.product_id) ORDER BY ac.ordinality)
 FROM jsonb_array_elements(coalesce(c.value->'accounts','[]'::jsonb)) WITH ORDINALITY ac(value,ordinality)
 LEFT JOIN public.customer_account_packages a ON a.customer_id=(c.value->>'userId')::uuid AND a.account_id=(ac.value->>'id')::uuid
 LEFT JOIN public.products p ON p.id=a.product_id
 LEFT JOIN LATERAL (SELECT string_agg(i.product_name,', ' ORDER BY i.id) package FROM public.order_items i WHERE i.order_id=coalesce((SELECT cr.order_id FROM private.app_credentials cr WHERE cr.id=(ac.value->>'id')::uuid),(SELECT pc.order_id FROM private.pending_order_credentials pc WHERE pc.order_id=(ac.value->>'id')::uuid LIMIT 1))) recorded ON true),'[]'::jsonb)
 ) ORDER BY c.ordinality),'[]'::jsonb)
 FROM jsonb_array_elements(public.admin_customer_subscription_details()) WITH ORDINALITY c(value,ordinality)
 LEFT JOIN public.customer_list_usernames u ON u.customer_id=(c.value->>'userId')::uuid);
END $$;