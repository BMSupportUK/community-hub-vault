DO $patch$
DECLARE r record; definition text;
BEGIN
 FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('staff_extend_credential','staff_create_credential','staff_create_credential_with_expiry') LOOP
  definition := pg_get_functiondef(r.oid);
  definition := replace(definition, 'ARRAY[''admin'',''management'',''staff'']', 'ARRAY[''admin'',''management'']');
  EXECUTE definition;
 END LOOP;
END $patch$;