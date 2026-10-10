CREATE TABLE public.temporary_accounts (
  user_id uuid PRIMARY KEY,
  email text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.temporary_accounts TO service_role;
ALTER TABLE public.temporary_accounts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.purge_user_data(_uid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.table_name, c.column_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name
    WHERE c.table_schema='public' AND t.table_type='BASE TABLE' AND c.data_type='uuid'
      AND c.column_name IN ('user_id','owner_id','author_id','sender_id','created_by','requester_id','customer_id','recipient_id','reporter_id','viewer_id','user_a','user_b','requester','addressee')
      AND c.table_name <> 'temporary_accounts'
  LOOP
    BEGIN
      EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.table_name, r.column_name) USING _uid;
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
  DELETE FROM public.profiles WHERE id = _uid;
END $$;
REVOKE ALL ON FUNCTION public.purge_user_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_user_data(uuid) TO service_role;