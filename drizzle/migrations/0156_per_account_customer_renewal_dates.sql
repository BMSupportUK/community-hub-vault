CREATE TABLE public.customer_account_renewal_dates(customer_id uuid NOT NULL,account_id uuid NOT NULL,renewed_date date NOT NULL,updated_by uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(customer_id,account_id));
GRANT SELECT ON public.customer_account_renewal_dates TO authenticated;
GRANT ALL ON public.customer_account_renewal_dates TO service_role;
ALTER TABLE public.customer_account_renewal_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_renewal_dates_read ON public.customer_account_renewal_dates FOR SELECT TO authenticated USING(public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]));
CREATE FUNCTION public.admin_set_customer_account_renewed(p_customer_id uuid,p_account_id uuid,p_renewed_date date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin']::public.app_role[]) THEN RAISE EXCEPTION 'Only admin can edit last renewed date'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.admin_customer_subscriptions()) c CROSS JOIN LATERAL jsonb_array_elements(coalesce(c->'accounts','[]'::jsonb)) a WHERE (c->>'userId')::uuid=p_customer_id AND (a->>'id')::uuid=p_account_id) THEN RAISE EXCEPTION 'Customer account not found'; END IF;
 IF p_renewed_date IS NULL THEN DELETE FROM public.customer_account_renewal_dates WHERE customer_id=p_customer_id AND account_id=p_account_id;
 ELSE INSERT INTO public.customer_account_renewal_dates(customer_id,account_id,renewed_date,updated_by) VALUES(p_customer_id,p_account_id,p_renewed_date,auth.uid()) ON CONFLICT(customer_id,account_id) DO UPDATE SET renewed_date=excluded.renewed_date,updated_by=excluded.updated_by,updated_at=now(); END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_customer_account_renewed(uuid,uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_customer_account_renewed(uuid,uuid,date) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.admin_customer_subscription_details() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,private AS $$
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(c.value || jsonb_build_object(
 'package',coalesce(nullif(regexp_replace(c.value->>'package','(^|, )[0-9]+ × ','\1','g'),''),p.name),
 'packageAllocated',nullif(c.value->>'package','') IS NULL AND a.customer_id IS NOT NULL,
 'recordedRenewedAt',c.value->'renewedAt',
 'renewedAt',CASE WHEN r.customer_id IS NOT NULL THEN to_jsonb(r.renewed_date::timestamp AT TIME ZONE 'Europe/London') ELSE c.value->'renewedAt' END,
 'renewedDateAdjusted',r.customer_id IS NOT NULL,
 'accounts',coalesce((SELECT jsonb_agg(ac.value || jsonb_build_object(
 'renewedAt',coalesce(to_jsonb(ar.renewed_date),CASE WHEN jsonb_array_length(c.value->'accounts')=1 THEN coalesce(to_jsonb(r.renewed_date),c.value->'renewedAt') ELSE to_jsonb(recorded.stamp) END),
 'renewedDateAdjusted',ar.account_id IS NOT NULL OR (jsonb_array_length(c.value->'accounts')=1 AND r.customer_id IS NOT NULL)
 ) ORDER BY ac.ordinality)
 FROM jsonb_array_elements(coalesce(c.value->'accounts','[]'::jsonb)) WITH ORDINALITY ac(value,ordinality)
 LEFT JOIN public.customer_account_renewal_dates ar ON ar.customer_id=(c.value->>'userId')::uuid AND ar.account_id=(ac.value->>'id')::uuid
 LEFT JOIN LATERAL (SELECT max(o.paid_at) stamp FROM private.orders o LEFT JOIN public.order_checkout_links l ON l.order_id=o.id
 WHERE o.paid_at IS NOT NULL AND o.status::text<>'cancelled' AND (o.customer_type='existing' OR l.customer_kind IN('existing','renewal'))
 AND (l.renewal_credential_id=(ac.value->>'id')::uuid OR EXISTS(SELECT 1 FROM private.app_credentials cr WHERE cr.id=(ac.value->>'id')::uuid AND cr.order_id=o.id) OR o.id=(ac.value->>'id')::uuid
 OR (l.renewal_credential_id IS NULL AND lower(trim(o.existing_username))=lower(trim(ac.value->>'login')) AND trim(coalesce(ac.value->>'login',''))<>''))) recorded ON true),'[]'::jsonb)
 ) ORDER BY c.ordinality),'[]'::jsonb)
 FROM jsonb_array_elements(public.admin_customer_subscriptions_with_tenure()) WITH ORDINALITY c(value,ordinality)
 LEFT JOIN public.customer_package_allocations a ON a.customer_id=(c.value->>'userId')::uuid
 LEFT JOIN public.products p ON p.id=a.product_id
 LEFT JOIN public.customer_renewal_date_corrections r ON r.customer_id=(c.value->>'userId')::uuid
 WHERE NOT public.admin_customer_is_hidden((c.value->>'userId')::uuid,c.value->>'username',c.value->>'displayName'));
END $$;