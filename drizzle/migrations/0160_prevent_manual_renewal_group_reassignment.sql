DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.admin_group_manual_customer_order(uuid,uuid,uuid)'::regprocedure);
 d:=replace(d,'IF p_account_id IS NOT NULL THEN', 'IF l.renewal_applied_at IS NOT NULL AND (l.renewal_account_id IS DISTINCT FROM p_account_id OR l.renewal_customer_id IS DISTINCT FROM p_customer_id) THEN RAISE EXCEPTION ''An applied renewal cannot be reassigned''; END IF;'||E'\n'||' IF p_account_id IS NOT NULL THEN');
 EXECUTE d;
END $$;