CREATE TABLE public.manual_name_customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL,
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.manual_name_customers TO authenticated;
GRANT ALL ON public.manual_name_customers TO service_role;
ALTER TABLE public.manual_name_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY manual_name_customers_admin_read ON public.manual_name_customers FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]));

DO $patch$
DECLARE d text;
BEGIN
 d:=pg_get_functiondef('public.admin_customer_subscriptions()'::regprocedure);
 IF position('WHERE NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=paid.customer_id) ORDER BY paid.customer_id,paid.created_at,paid.id)' IN d)=0 THEN RAISE EXCEPTION 'Customer listing definition changed'; END IF;
 d:=replace(d,
  'WHERE NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=paid.customer_id) ORDER BY paid.customer_id,paid.created_at,paid.id)',
  'WHERE NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=paid.customer_id) ORDER BY paid.customer_id,paid.created_at,paid.id)'
  || E'\n  UNION ALL\n  SELECT n.id,NULL,n.name,false FROM public.manual_name_customers n');
 EXECUTE d;
END $patch$;