CREATE OR REPLACE FUNCTION public.manual_credentials_set_checkout_pin(p_token text,p_password text,p_email_key text,p_pin_hash text,p_pin_salt text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_catalog AS $$
BEGIN
 IF p_pin_hash IS NULL OR length(p_pin_hash)<>64 OR p_pin_salt IS NULL OR length(p_pin_salt)<>48 THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.order_checkout_links l JOIN private.orders o ON o.id=l.order_id WHERE l.token=p_token AND l.claimed_by IS NULL AND upper(btrim(l.password))=upper(btrim(p_password)) AND (o.customer_type='manual' OR o.order_ref LIKE 'MANUAL-%') AND o.status::text<>'cancelled' AND coalesce(private.app_decrypt(o.email_enc),'')<>'') THEN RETURN false; END IF;
 INSERT INTO public.manual_credential_access(email_key,pin_hash,pin_salt) VALUES(p_email_key,p_pin_hash,p_pin_salt) ON CONFLICT(email_key) DO UPDATE SET pin_hash=EXCLUDED.pin_hash,pin_salt=EXCLUDED.pin_salt,session_hash=NULL,session_expires_at=NULL WHERE manual_credential_access.pin_hash IS NULL;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.manual_credentials_set_checkout_pin(text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.manual_credentials_set_checkout_pin(text,text,text,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.manual_credentials_verify_pin(p_email_key text,p_email text,p_code_hash text,p_pin_hash text,p_pin_salt text,p_session_hash text,p_app_login text DEFAULT NULL,p_app_password text DEFAULT NULL) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE a public.manual_credential_access%ROWTYPE;
BEGIN
 SELECT * INTO a FROM public.manual_credential_access WHERE email_key=p_email_key FOR UPDATE;
 IF NOT FOUND OR a.code_hash IS NULL OR a.code_expires_at IS NULL OR a.code_expires_at<=now() OR a.attempts>=5 OR a.pin_locked_until>now() THEN RETURN 'invalid'; END IF;
 UPDATE public.manual_credential_access SET attempts=attempts+1 WHERE email_key=p_email_key;
 IF a.code_hash<>p_code_hash THEN RETURN 'invalid'; END IF;
 IF a.pin_hash IS NULL THEN RETURN 'setup_required'; END IF;
 IF p_pin_hash IS NULL OR p_pin_salt IS NULL OR a.pin_salt<>p_pin_salt OR a.pin_hash<>p_pin_hash THEN
  UPDATE public.manual_credential_access SET pin_attempts=CASE WHEN a.pin_locked_until<=now() THEN 1 ELSE pin_attempts+1 END,pin_locked_until=CASE WHEN (CASE WHEN a.pin_locked_until<=now() THEN 1 ELSE a.pin_attempts+1 END)>=5 THEN now()+interval '1 hour' ELSE NULL END WHERE email_key=p_email_key;
  RETURN 'invalid';
 END IF;
 UPDATE public.manual_credential_access SET pin_attempts=0,pin_locked_until=NULL,code_hash=NULL,code_expires_at=NULL,session_hash=p_session_hash,session_expires_at=now()+interval '10 minutes' WHERE email_key=p_email_key;
 RETURN 'verified';
END $$;
COMMENT ON FUNCTION public.manual_credentials_verify_pin(text,text,text,text,text,text,text,text) IS 'Sign-in only. Deprecated app-login parameters are ignored; PIN enrollment is restricted to manual secure checkout.';