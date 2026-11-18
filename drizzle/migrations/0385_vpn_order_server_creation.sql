DO $$
DECLARE d text;
BEGIN
 d := pg_get_functiondef('public.tg_orders_iud()'::regprocedure);
 IF position('IF NEW.user_id IS DISTINCT FROM auth.uid() THEN' in d)=0 THEN RAISE EXCEPTION 'Unexpected order insert guard'; END IF;
 d := replace(d,'IF NEW.user_id IS DISTINCT FROM auth.uid() THEN','IF coalesce(auth.role(),'''') <> ''service_role'' AND NEW.user_id IS DISTINCT FROM auth.uid() THEN');
 d := replace(d,'customer_type, existing_username, notes, wants_adult_content, shipping_address_enc, email_enc,','customer_type, existing_username, notes, wants_adult_content, credential_id, shipping_address_enc, email_enc,');
 d := replace(d,'NEW.shipping_name, NEW.customer_type, NEW.existing_username, NEW.notes, NEW.wants_adult_content,','NEW.shipping_name, NEW.customer_type, NEW.existing_username, NEW.notes, NEW.wants_adult_content, NEW.credential_id,');
 EXECUTE d;
END $$;