CREATE OR REPLACE FUNCTION public.customer_has_approved_member_role(p_roles public.app_role[])
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO public
AS $$
 SELECT coalesce(p_roles && ARRAY['member','subscriber','nonsubscriber']::public.app_role[],false)
 AND NOT coalesce(p_roles && ARRAY['pending','banned','rejected','admin','management','staff','moderator']::public.app_role[],false);
$$;
REVOKE ALL ON FUNCTION public.customer_has_approved_member_role(public.app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_has_approved_member_role(public.app_role[]) TO authenticated, service_role;
DO $$
DECLARE current_definition text; revised_definition text;
BEGIN
 SELECT pg_get_functiondef('public.admin_customer_subscriptions()'::regprocedure) INTO current_definition;
 revised_definition := replace(current_definition,
 'WHERE EXISTS(SELECT 1 FROM public.manually_added_customers m WHERE m.user_id=p.id) OR EXISTS(SELECT 1 FROM private.app_credentials c WHERE c.owner_id=p.id) OR EXISTS(SELECT 1 FROM paid WHERE paid.customer_id=p.id)',
 'WHERE public.customer_has_approved_member_role(ARRAY(SELECT r.role FROM public.user_roles r WHERE r.user_id=p.id)) OR EXISTS(SELECT 1 FROM public.manually_added_customers m WHERE m.user_id=p.id) OR EXISTS(SELECT 1 FROM private.app_credentials c WHERE c.owner_id=p.id) OR EXISTS(SELECT 1 FROM paid WHERE paid.customer_id=p.id)');
 IF revised_definition = current_definition THEN RAISE EXCEPTION 'Expected customer inclusion predicate not found'; END IF;
 EXECUTE revised_definition;
END $$;