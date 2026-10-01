DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.submit_appeal(text)'::regprocedure);
  d := replace(d, $q$(content LIKE 'Appeal Reference:%' OR$q$, $q$(content LIKE 'Appeal Reference:%' OR content LIKE '⚖️ Appeal request — %' OR$q$);
  EXECUTE d;
END $$;