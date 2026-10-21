CREATE TABLE public.customer_portal_login_codes (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 code_hash text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
 failed_attempts integer NOT NULL DEFAULT 0,
 issued_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.customer_portal_login_codes TO service_role;
ALTER TABLE public.customer_portal_login_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service manages portal login codes" ON public.customer_portal_login_codes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE OR REPLACE FUNCTION public.portal_issue_login_code(p_user_id uuid,p_code_hash text) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE e timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('portal-login-code:' || p_user_id::text,0));
 INSERT INTO public.customer_portal_login_codes(user_id,code_hash) VALUES(p_user_id,p_code_hash)
 ON CONFLICT(user_id) DO UPDATE SET code_hash=EXCLUDED.code_hash, expires_at=now()+interval '24 hours',failed_attempts=0,issued_at=now()
 RETURNING expires_at INTO e;
 RETURN e;
END $$;
CREATE OR REPLACE FUNCTION public.portal_verify_login_code(p_user_id uuid,p_code_hash text) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE r public.customer_portal_login_codes%ROWTYPE;
BEGIN
 SELECT * INTO r FROM public.customer_portal_login_codes WHERE user_id=p_user_id FOR UPDATE;
 IF NOT FOUND OR r.expires_at<=now() OR r.failed_attempts>=5 THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.customer_portals p WHERE p.user_id=p_user_id AND (p.reset_at IS NULL OR p.reset_at<r.issued_at)) THEN RETURN NULL; END IF;
 IF r.code_hash<>p_code_hash THEN
 UPDATE public.customer_portal_login_codes SET failed_attempts=failed_attempts+1 WHERE user_id=p_user_id;
 RETURN NULL;
 END IF;
 RETURN least(now()+interval '1 hour',r.expires_at);
END $$;
REVOKE ALL ON FUNCTION public.portal_issue_login_code(uuid,text),public.portal_verify_login_code(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.portal_issue_login_code(uuid,text),public.portal_verify_login_code(uuid,text) TO service_role;
COMMENT ON TABLE public.customer_portal_links IS 'Legacy emailed bearer links; new portal authentication uses customer_portal_login_codes.';