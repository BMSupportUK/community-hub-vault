CREATE OR REPLACE FUNCTION public.admin_customer_is_hidden(p_user_id uuid,p_username text,p_display_name text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(p_user_id IN ('9521bac8-d7d3-40bd-829c-192854f3ec35'::uuid,'73c113ce-ce1b-43f0-af24-c2a36cf0d8e7'::uuid),false)
  OR lower(regexp_replace(coalesce(p_username,''),'[^a-z0-9]','','g')) IN ('guest48h','guest48hsite','danej','danejsite')
  OR lower(regexp_replace(coalesce(p_display_name,''),'[^a-z0-9]','','g')) IN ('guest48h','guest48hsite','danej','danejsite')
$$;
REVOKE ALL ON FUNCTION public.admin_customer_is_hidden(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_customer_is_hidden(uuid,text,text) TO authenticated,service_role;

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
 LEFT JOIN public.customer_renewal_date_corrections r ON r.customer_id=(c.value->>'userId')::uuid
 WHERE NOT public.admin_customer_is_hidden((c.value->>'userId')::uuid,c.value->>'username',c.value->>'displayName'));
END $$;
REVOKE ALL ON FUNCTION public.admin_customer_subscription_details() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_customer_subscription_details() TO authenticated,service_role;