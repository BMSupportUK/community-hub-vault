CREATE OR REPLACE FUNCTION public.admin_customer_subscription_details()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management','staff']::public.app_role[]) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(c.value || jsonb_build_object(
 'package',coalesce(nullif(regexp_replace(c.value->>'package','(^|, )[0-9]+ × ','\1','g'),''),p.name),
 'packageAllocated',nullif(c.value->>'package','') IS NULL AND a.customer_id IS NOT NULL,
 'recordedRenewedAt',c.value->'renewedAt',
 'renewedAt',CASE WHEN r.customer_id IS NOT NULL AND (nullif(c.value->>'renewedAt','') IS NULL OR (r.renewed_date::timestamp AT TIME ZONE 'Europe/London') >= (c.value->>'renewedAt')::timestamptz) THEN to_jsonb(r.renewed_date::timestamp AT TIME ZONE 'Europe/London') ELSE c.value->'renewedAt' END,
 'renewedDateAdjusted',r.customer_id IS NOT NULL,
 'accounts',coalesce((SELECT jsonb_agg(ac.value || jsonb_build_object(
 'renewedAt',CASE
   WHEN ar.account_id IS NOT NULL AND (recorded.stamp IS NULL OR (ar.renewed_date::timestamp AT TIME ZONE 'Europe/London') >= recorded.stamp) THEN to_jsonb(ar.renewed_date)
   WHEN ar.account_id IS NOT NULL THEN to_jsonb(recorded.stamp)
   WHEN jsonb_array_length(c.value->'accounts')=1 THEN CASE
     WHEN r.customer_id IS NOT NULL AND (recorded.stamp IS NULL OR (r.renewed_date::timestamp AT TIME ZONE 'Europe/London') >= recorded.stamp) THEN to_jsonb(r.renewed_date)
     ELSE coalesce(to_jsonb(recorded.stamp),c.value->'renewedAt') END
   ELSE to_jsonb(recorded.stamp) END,
 'renewedDateAdjusted',ar.account_id IS NOT NULL OR (jsonb_array_length(c.value->'accounts')=1 AND r.customer_id IS NOT NULL)
 ) ORDER BY ac.ordinality)
 FROM jsonb_array_elements(coalesce(c.value->'accounts','[]'::jsonb)) WITH ORDINALITY ac(value,ordinality)
 LEFT JOIN public.customer_account_renewal_dates ar ON ar.customer_id=(c.value->>'userId')::uuid AND ar.account_id=(ac.value->>'id')::uuid
 LEFT JOIN LATERAL (SELECT max(o.paid_at) stamp FROM private.orders o LEFT JOIN public.order_checkout_links l ON l.order_id=o.id
 WHERE o.paid_at IS NOT NULL AND o.status::text<>'cancelled' AND (o.customer_type='existing' OR l.customer_kind IN('existing','renewal'))
 AND (l.renewal_account_id=(ac.value->>'id')::uuid OR l.renewal_credential_id=(ac.value->>'id')::uuid OR EXISTS(SELECT 1 FROM private.app_credentials cr WHERE cr.id=(ac.value->>'id')::uuid AND cr.order_id=o.id) OR o.id=(ac.value->>'id')::uuid
 OR (l.renewal_credential_id IS NULL AND lower(trim(o.existing_username))=lower(trim(ac.value->>'login')) AND trim(coalesce(ac.value->>'login',''))<>''))) recorded ON true),'[]'::jsonb)
 ) ORDER BY c.ordinality),'[]'::jsonb)
 FROM jsonb_array_elements(public.admin_customer_subscriptions_with_tenure()) WITH ORDINALITY c(value,ordinality)
 LEFT JOIN public.customer_package_allocations a ON a.customer_id=(c.value->>'userId')::uuid
 LEFT JOIN public.products p ON p.id=a.product_id
 LEFT JOIN public.customer_renewal_date_corrections r ON r.customer_id=(c.value->>'userId')::uuid
 WHERE NOT public.admin_customer_is_hidden((c.value->>'userId')::uuid,c.value->>'username',c.value->>'displayName'));
END $function$;