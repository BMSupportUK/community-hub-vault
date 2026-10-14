CREATE OR REPLACE FUNCTION public.staff_checkout_order_summary(p_order_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid,status text,total_cents integer,created_at timestamptz,paid_at timestamptz,completed_at timestamptz,shipping_name text,existing_username text,customer_type text,order_ref text,manual_pay_method text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,private AS $$
BEGIN
 IF NOT public.has_any_role(auth.uid(), ARRAY['admin','management','staff']::public.app_role[]) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN QUERY SELECT o.id,o.status::text,o.total_cents::integer,o.created_at,o.paid_at,o.completed_at,o.shipping_name::text,o.existing_username::text,o.customer_type::text,o.order_ref::text,o.manual_pay_method::text FROM private.orders o WHERE (p_order_id IS NULL OR o.id=p_order_id) ORDER BY o.created_at DESC LIMIT 5000;
END $$;
REVOKE ALL ON FUNCTION public.staff_checkout_order_summary(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_checkout_order_summary(uuid) TO authenticated,service_role;
ALTER POLICY "checkout links admin read" ON public.order_checkout_links TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','management','staff']::public.app_role[]));
ALTER POLICY "checkout chat staff read" ON public.checkout_chat_messages TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','management','staff']::public.app_role[]));
ALTER POLICY "checkout chat staff insert" ON public.checkout_chat_messages TO authenticated WITH CHECK (sender='staff' AND staff_id=auth.uid() AND public.has_any_role(auth.uid(), ARRAY['admin','management','staff']::public.app_role[]));
GRANT SELECT ON public.order_checkout_links TO authenticated;
GRANT SELECT,INSERT ON public.checkout_chat_messages TO authenticated;
DO $patch$
DECLARE r record; definition text;
BEGIN
 FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('staff_set_order_credential_expiry','staff_stash_order_credential','staff_stash_order_credential_with_expiry') LOOP
  definition := pg_get_functiondef(r.oid);
  definition := replace(definition, 'ARRAY[''admin'',''management'',''staff'']', 'ARRAY[''admin'',''management'']');
  EXECUTE definition;
 END LOOP;
END $patch$;