ALTER TABLE public.manual_name_customers ADD COLUMN IF NOT EXISTS subscription_expiry_date date;
COMMENT ON COLUMN public.manual_name_customers.subscription_expiry_date IS 'Optional existing subscription expiry captured when adding a manual contact; no account, order or payment is created.';
DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.admin_customer_subscription_list()'::regprocedure) INTO definition;
 IF position('''manualSetupPending'',EXISTS' IN definition)=0 THEN RAISE EXCEPTION 'Customer list definition changed'; END IF;
 definition := replace(definition,'''manualSetupPending'',EXISTS', '''manualExpiryDate'',(SELECT n.subscription_expiry_date FROM public.manual_name_customers n WHERE n.id=(c.value->>''userId'')::uuid),''manualSetupPending'',EXISTS');
 EXECUTE definition;
END $$;