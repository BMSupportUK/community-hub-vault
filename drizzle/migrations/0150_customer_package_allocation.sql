CREATE TABLE public.customer_package_allocations (customer_id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES public.products(id), allocated_by uuid NOT NULL, allocated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.customer_package_allocations TO authenticated;
GRANT ALL ON public.customer_package_allocations TO service_role;
ALTER TABLE public.customer_package_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_package_read ON public.customer_package_allocations FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]));

CREATE FUNCTION public.admin_customer_subscription_details() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,private AS $$
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(c.value || jsonb_build_object(
 'package',coalesce(nullif(regexp_replace(c.value->>'package','(^|, )[0-9]+ × ','\1','g'),''),p.name),
 'packageAllocated',nullif(c.value->>'package','') IS NULL AND a.customer_id IS NOT NULL
 ) ORDER BY c.ordinality),'[]'::jsonb)
 FROM jsonb_array_elements(public.admin_customer_subscriptions_with_tenure()) WITH ORDINALITY c(value,ordinality)
 LEFT JOIN public.customer_package_allocations a ON a.customer_id=(c.value->>'userId')::uuid
 LEFT JOIN public.products p ON p.id=a.product_id);
END $$;
REVOKE ALL ON FUNCTION public.admin_customer_subscription_details() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_customer_subscription_details() TO authenticated,service_role;

CREATE FUNCTION public.admin_allocate_customer_package(p_customer_id uuid,p_product_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE customer jsonb;
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin']::public.app_role[]) THEN RAISE EXCEPTION 'Only admin can allocate packages'; END IF;
 SELECT c INTO customer FROM jsonb_array_elements(public.admin_customer_subscriptions()) c WHERE (c->>'userId')::uuid=p_customer_id;
 IF customer IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF;
 IF nullif(customer->>'package','') IS NOT NULL THEN RAISE EXCEPTION 'Customer already has a recorded package'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=p_product_id AND is_active) THEN RAISE EXCEPTION 'Choose an available package'; END IF;
 INSERT INTO public.customer_package_allocations(customer_id,product_id,allocated_by) VALUES(p_customer_id,p_product_id,auth.uid()) ON CONFLICT(customer_id) DO UPDATE SET product_id=excluded.product_id,allocated_by=excluded.allocated_by,allocated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.admin_allocate_customer_package(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_allocate_customer_package(uuid,uuid) TO authenticated,service_role;