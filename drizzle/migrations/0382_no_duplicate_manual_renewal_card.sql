DO $patch$
DECLARE d text; n text;
BEGIN
 d:=pg_get_functiondef('public.admin_customer_subscriptions()'::regprocedure);
 n:=replace(d,'WHERE NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=paid.customer_id) ORDER BY paid.customer_id','WHERE NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=paid.customer_id) AND NOT EXISTS(SELECT 1 FROM public.manual_name_customers mn WHERE mn.id=paid.customer_id) ORDER BY paid.customer_id');
 IF n=d THEN RAISE EXCEPTION 'pattern not found'; END IF;
 EXECUTE n;
END $patch$;