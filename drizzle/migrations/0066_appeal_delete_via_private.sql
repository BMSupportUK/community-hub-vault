DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.submit_appeal(text)'::regprocedure);
  d := replace(d, $q$DELETE FROM public.gate_messages
  WHERE application_id = v_app_id
    AND sender_id = v_uid
    AND (content LIKE$q$, $q$DELETE FROM private.gate_messages
  WHERE application_id = v_app_id
    AND sender_id = v_uid
    AND (public.app_decrypt(content_enc) LIKE$q$);
  d := replace(d, $q$OR content LIKE '⚖️$q$, $q$OR public.app_decrypt(content_enc) LIKE '⚖️$q$);
  d := replace(d, $q$OR content = 'Hi!$q$, $q$OR public.app_decrypt(content_enc) = 'Hi!$q$);
  IF position('private.gate_messages' in d) = 0 THEN RAISE EXCEPTION 'replace failed'; END IF;
  EXECUTE d;
END $$;