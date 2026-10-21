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
 -- Portal stays unlocked until the end of the UK day it was unlocked.
 RETURN (date_trunc('day', now() AT TIME ZONE 'Europe/London') + interval '1 day') AT TIME ZONE 'Europe/London';
END $$;
REVOKE ALL ON FUNCTION public.portal_verify_login_code(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.portal_verify_login_code(uuid,text) TO service_role;