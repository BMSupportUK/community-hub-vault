CREATE OR REPLACE FUNCTION public.admin_manual_customer_emails() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id,'email',n.email)),'[]'::jsonb) FROM public.manual_name_customers n WHERE nullif(btrim(n.email),'') IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION public.admin_manual_customer_emails() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_manual_customer_emails() TO authenticated,service_role;