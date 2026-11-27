ALTER TABLE public.customer_portals ADD COLUMN IF NOT EXISTS unlocked_until timestamptz;

CREATE OR REPLACE FUNCTION public.portal_verify_login_code(p_user_id uuid, p_code_hash text)
 RETURNS timestamp with time zone LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE r public.customer_portal_login_codes%ROWTYPE; v_until timestamptz;
BEGIN
 SELECT * INTO r FROM public.customer_portal_login_codes WHERE user_id=p_user_id FOR UPDATE;
 IF NOT FOUND OR r.expires_at<=now() OR r.failed_attempts>=5 THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.customer_portals p WHERE p.user_id=p_user_id AND (p.reset_at IS NULL OR p.reset_at<r.issued_at)) THEN RETURN NULL; END IF;
 IF r.code_hash<>p_code_hash THEN
 UPDATE public.customer_portal_login_codes SET failed_attempts=failed_attempts+1 WHERE user_id=p_user_id;
 RETURN NULL;
 END IF;
 v_until := (date_trunc('day', now() AT TIME ZONE 'Europe/London') + interval '1 day') AT TIME ZONE 'Europe/London';
 UPDATE public.customer_portals SET unlocked_until = v_until WHERE user_id = p_user_id;
 RETURN v_until;
END $function$;