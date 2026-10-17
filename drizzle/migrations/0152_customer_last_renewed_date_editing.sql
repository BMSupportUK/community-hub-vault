CREATE TABLE public.customer_renewal_date_corrections (customer_id uuid PRIMARY KEY, renewed_date date NOT NULL, updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.customer_renewal_date_corrections TO authenticated;
GRANT ALL ON public.customer_renewal_date_corrections TO service_role;
ALTER TABLE public.customer_renewal_date_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_renewal_corrections_read ON public.customer_renewal_date_corrections FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]));
CREATE FUNCTION public.admin_set_customer_last_renewed(p_customer_id uuid,p_renewed_date date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin']::public.app_role[]) THEN RAISE EXCEPTION 'Only admin can edit last renewed date'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.admin_customer_subscriptions()) c WHERE (c->>'userId')::uuid=p_customer_id) THEN RAISE EXCEPTION 'Customer not found'; END IF;
 IF p_renewed_date IS NULL THEN
 DELETE FROM public.customer_renewal_date_corrections WHERE customer_id=p_customer_id;
 ELSE
 INSERT INTO public.customer_renewal_date_corrections(customer_id,renewed_date,updated_by) VALUES(p_customer_id,p_renewed_date,auth.uid()) ON CONFLICT(customer_id) DO UPDATE SET renewed_date=excluded.renewed_date,updated_by=excluded.updated_by,updated_at=now();
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_customer_last_renewed(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_customer_last_renewed(uuid,date) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.admin_customer_subscription_details() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,private AS $$
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(c.value || jsonb_build_object(
 'package',coalesce(nullif(regexp_replace(c.value->>'package','(^|, )[0-9]+ × ','\1','g'),''),p.name),
 'packageAllocated',nullif(c.value->>'package','') IS NULL AND a.customer_id IS NOT NULL,
 'recordedRenewedAt',c.value->'renewedAt',
 'renewedAt',CASE WHEN r.customer_id IS NOT NULL THEN to_jsonb(r.renewed_date::timestamp AT TIME ZONE 'Europe/London') ELSE c.value->'renewedAt' END,
 'renewedDateAdjusted',r.customer_id IS NOT NULL
 ) ORDER BY c.ordinality),'[]'::jsonb)
 FROM jsonb_array_elements(public.admin_customer_subscriptions_with_tenure()) WITH ORDINALITY c(value,ordinality)
 LEFT JOIN public.customer_package_allocations a ON a.customer_id=(c.value->>'userId')::uuid
 LEFT JOIN public.products p ON p.id=a.product_id
 LEFT JOIN public.customer_renewal_date_corrections r ON r.customer_id=(c.value->>'userId')::uuid);
END $$;