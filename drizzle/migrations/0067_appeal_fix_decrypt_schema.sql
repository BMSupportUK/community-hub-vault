DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.submit_appeal(text)'::regprocedure);
  d := replace(d, 'public.app_decrypt(', 'private.app_decrypt(');
  EXECUTE d;
END $$;