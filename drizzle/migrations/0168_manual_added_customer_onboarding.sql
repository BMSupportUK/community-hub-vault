CREATE TABLE public.manually_added_customers (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.manually_added_customers TO authenticated;
GRANT ALL ON public.manually_added_customers TO service_role;
ALTER TABLE public.manually_added_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY manually_added_customers_admin_read ON public.manually_added_customers FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]));
INSERT INTO public.manually_added_customers(user_id,created_at)
 SELECT u.id,u.created_at FROM auth.users u JOIN public.profiles p ON p.id=u.id WHERE u.raw_user_meta_data->>'admin_created'='true' ON CONFLICT DO NOTHING;
DO $patch$
DECLARE d text;
BEGIN
 d:=pg_get_functiondef('public.admin_customer_subscriptions()'::regprocedure);
 IF position('WHERE EXISTS(SELECT 1 FROM private.app_credentials c WHERE c.owner_id=p.id)' IN d)=0 THEN RAISE EXCEPTION 'Customer listing definition changed'; END IF;
 d:=replace(d,'WHERE EXISTS(SELECT 1 FROM private.app_credentials c WHERE c.owner_id=p.id)','WHERE EXISTS(SELECT 1 FROM public.manually_added_customers m WHERE m.user_id=p.id) OR EXISTS(SELECT 1 FROM private.app_credentials c WHERE c.owner_id=p.id)');
 EXECUTE d;
 d:=pg_get_functiondef('public.admin_customer_subscription_list()'::regprocedure);
 IF position('''username'',CASE' IN d)=0 THEN RAISE EXCEPTION 'Customer detail definition changed'; END IF;
 d:=replace(d,'''username'',CASE','''manualSetupPending'',EXISTS(SELECT 1 FROM public.manually_added_customers m JOIN auth.users au ON au.id=m.user_id WHERE m.user_id=(c.value->>''userId'')::uuid AND au.raw_user_meta_data->>''needs_profile''=''true''),''username'',CASE');
 EXECUTE d;
END $patch$;