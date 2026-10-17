CREATE TABLE public.customer_subscription_history (customer_id uuid PRIMARY KEY, first_subscription_date date NOT NULL, updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.customer_subscription_history TO authenticated;
GRANT ALL ON public.customer_subscription_history TO service_role;
ALTER TABLE public.customer_subscription_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_history_staff_read ON public.customer_subscription_history FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]));

CREATE FUNCTION public.admin_customer_subscriptions_with_tenure() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,private AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT coalesce(jsonb_agg(c.value || jsonb_build_object(
 'firstSubscriptionAt',coalesce(to_jsonb(h.first_subscription_date),c.value->'firstSubscriptionAt'),
 'recordedFirstSubscriptionAt',c.value->'firstSubscriptionAt',
 'firstSubscriptionAdjusted',h.customer_id IS NOT NULL,
 'customerYears',CASE WHEN coalesce(h.first_subscription_date,((c.value->>'firstSubscriptionAt')::timestamptz AT TIME ZONE 'Europe/London')::date) IS NULL THEN NULL ELSE greatest(0,extract(year FROM age((now() AT TIME ZONE 'Europe/London')::date,coalesce(h.first_subscription_date,((c.value->>'firstSubscriptionAt')::timestamptz AT TIME ZONE 'Europe/London')::date)))::int) END
 ) ORDER BY c.ordinality),'[]'::jsonb) INTO result
 FROM jsonb_array_elements(public.admin_customer_subscriptions()) WITH ORDINALITY AS c(value,ordinality)
 LEFT JOIN public.customer_subscription_history h ON h.customer_id=(c.value->>'userId')::uuid;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_customer_subscriptions_with_tenure() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_customer_subscriptions_with_tenure() TO authenticated,service_role;

CREATE FUNCTION public.admin_set_customer_first_subscription(p_customer_id uuid,p_first_subscription_date date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin']::public.app_role[]) THEN RAISE EXCEPTION 'Only admin can correct customer history'; END IF;
 IF p_first_subscription_date > (now() AT TIME ZONE 'Europe/London')::date THEN RAISE EXCEPTION 'First subscription date cannot be in the future'; END IF;
 IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.admin_customer_subscriptions()) c WHERE (c->>'userId')::uuid=p_customer_id) THEN RAISE EXCEPTION 'Customer not found'; END IF;
 IF p_first_subscription_date IS NULL THEN
 DELETE FROM public.customer_subscription_history WHERE customer_id=p_customer_id;
 ELSE
 INSERT INTO public.customer_subscription_history(customer_id,first_subscription_date,updated_by) VALUES(p_customer_id,p_first_subscription_date,auth.uid()) ON CONFLICT(customer_id) DO UPDATE SET first_subscription_date=excluded.first_subscription_date,updated_by=excluded.updated_by,updated_at=now();
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_customer_first_subscription(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_customer_first_subscription(uuid,date) TO authenticated,service_role;