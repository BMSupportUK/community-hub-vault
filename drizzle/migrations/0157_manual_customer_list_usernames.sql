CREATE TABLE public.customer_list_usernames(customer_id uuid PRIMARY KEY,username text NOT NULL CHECK(length(trim(username))>0),updated_by uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.customer_list_usernames TO authenticated;
GRANT ALL ON public.customer_list_usernames TO service_role;
ALTER TABLE public.customer_list_usernames ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_list_usernames_read ON public.customer_list_usernames FOR SELECT TO authenticated USING(public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]));
CREATE FUNCTION public.admin_set_customer_list_username(p_customer_id uuid,p_username text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE c jsonb;
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin']::public.app_role[]) THEN RAISE EXCEPTION 'Only admin can edit customer username'; END IF;
 SELECT value INTO c FROM jsonb_array_elements(public.admin_customer_subscription_details()) WHERE (value->>'userId')::uuid=p_customer_id;
 IF c IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF;
 IF coalesce((c->>'hasSiteAccount')::boolean,false) THEN RAISE EXCEPTION 'Only customers with no site account can be edited here'; END IF;
 IF nullif(trim(p_username),'') IS NULL THEN RAISE EXCEPTION 'Enter a username'; END IF;
 INSERT INTO public.customer_list_usernames(customer_id,username,updated_by) VALUES(p_customer_id,trim(p_username),auth.uid()) ON CONFLICT(customer_id) DO UPDATE SET username=excluded.username,updated_by=excluded.updated_by,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.admin_set_customer_list_username(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_customer_list_username(uuid,text) TO authenticated,service_role;
CREATE FUNCTION public.admin_customer_subscription_list() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,private AS $$
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(c.value || jsonb_build_object('username',CASE WHEN coalesce((c.value->>'hasSiteAccount')::boolean,false) THEN c.value->>'username' ELSE coalesce(u.username,c.value->>'username') END) ORDER BY c.ordinality),'[]'::jsonb)
 FROM jsonb_array_elements(public.admin_customer_subscription_details()) WITH ORDINALITY c(value,ordinality)
 LEFT JOIN public.customer_list_usernames u ON u.customer_id=(c.value->>'userId')::uuid);
END $$;
REVOKE ALL ON FUNCTION public.admin_customer_subscription_list() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_customer_subscription_list() TO authenticated,service_role;