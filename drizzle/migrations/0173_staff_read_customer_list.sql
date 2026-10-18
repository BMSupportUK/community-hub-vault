DO $$
DECLARE r record; def text;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('admin_customer_subscription_list','admin_customer_subscription_details','admin_customer_subscriptions','admin_customer_subscriptions_with_tenure','app_credentials_visible') LOOP
    def := pg_get_functiondef(r.oid);
    def := replace(def, $q$has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[])$q$, $q$has_any_role(auth.uid(),ARRAY['admin','management','staff']::public.app_role[])$q$);
    def := replace(def, $q$has_any_role(auth.uid(), array['admin','management']::public.app_role[])$q$, $q$has_any_role(auth.uid(), array['admin','management','staff']::public.app_role[])$q$);
    EXECUTE def;
  END LOOP;
END $$;