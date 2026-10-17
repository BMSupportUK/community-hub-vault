ALTER TABLE public.manual_credential_access ADD COLUMN pin_hash text, ADD COLUMN pin_salt text, ADD COLUMN pin_attempts integer NOT NULL DEFAULT 0, ADD COLUMN pin_locked_until timestamptz;
COMMENT ON COLUMN public.manual_credential_access.pin_hash IS 'Salted PBKDF2-SHA256 customer PIN verifier; never store or email plaintext PINs.';
CREATE OR REPLACE FUNCTION public.manual_credentials_verify(p_email_key text,p_code_hash text,p_session_hash text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_catalog AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.manual_credentials_verify_pin(p_email_key text,p_email text,p_code_hash text,p_pin_hash text,p_pin_salt text,p_session_hash text,p_app_login text DEFAULT NULL,p_app_password text DEFAULT NULL) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE a public.manual_credential_access%ROWTYPE; proof boolean;
BEGIN
 SELECT * INTO a FROM public.manual_credential_access WHERE email_key=p_email_key FOR UPDATE;
 IF NOT FOUND OR a.code_hash IS NULL OR a.code_expires_at IS NULL OR a.code_expires_at<=now() OR a.attempts>=5 OR a.pin_locked_until>now() THEN RETURN 'invalid'; END IF;
 UPDATE public.manual_credential_access SET attempts=attempts+1 WHERE email_key=p_email_key;
 IF a.code_hash<>p_code_hash THEN RETURN 'invalid'; END IF;
 IF p_pin_hash IS NULL OR length(p_pin_hash)<>64 OR p_pin_salt IS NULL OR length(p_pin_salt)<>48 THEN RETURN 'invalid'; END IF;
 IF a.pin_hash IS NULL THEN
  IF coalesce(p_app_login,'')='' OR coalesce(p_app_password,'')='' THEN RETURN 'setup_required'; END IF;
  SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(public.manual_credentials_for_email(p_email)) c WHERE c->>'login'=p_app_login AND c->>'password'=p_app_password) INTO proof;
  IF NOT proof THEN
   UPDATE public.manual_credential_access SET pin_attempts=CASE WHEN a.pin_locked_until<=now() THEN 1 ELSE pin_attempts+1 END,pin_locked_until=CASE WHEN (CASE WHEN a.pin_locked_until<=now() THEN 1 ELSE a.pin_attempts+1 END)>=5 THEN now()+interval '1 hour' ELSE NULL END WHERE email_key=p_email_key;
   RETURN 'invalid';
  END IF;
 ELSE
  IF a.pin_salt<>p_pin_salt OR a.pin_hash<>p_pin_hash THEN
   UPDATE public.manual_credential_access SET pin_attempts=CASE WHEN a.pin_locked_until<=now() THEN 1 ELSE pin_attempts+1 END,pin_locked_until=CASE WHEN (CASE WHEN a.pin_locked_until<=now() THEN 1 ELSE a.pin_attempts+1 END)>=5 THEN now()+interval '1 hour' ELSE NULL END WHERE email_key=p_email_key;
   RETURN 'invalid';
  END IF;
 END IF;
 UPDATE public.manual_credential_access SET pin_hash=coalesce(pin_hash,p_pin_hash),pin_salt=coalesce(pin_salt,p_pin_salt),pin_attempts=0,pin_locked_until=NULL,code_hash=NULL,code_expires_at=NULL,session_hash=p_session_hash,session_expires_at=now()+interval '10 minutes' WHERE email_key=p_email_key;
 RETURN 'verified';
END $$;
REVOKE ALL ON FUNCTION public.manual_credentials_verify_pin(text,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.manual_credentials_verify_pin(text,text,text,text,text,text,text,text) TO service_role;