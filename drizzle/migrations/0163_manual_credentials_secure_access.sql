CREATE TABLE public.manual_credential_access (email_key text PRIMARY KEY, code_hash text, code_expires_at timestamptz, attempts integer NOT NULL DEFAULT 0, session_hash text, session_expires_at timestamptz);
GRANT ALL ON public.manual_credential_access TO service_role;
ALTER TABLE public.manual_credential_access ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.manual_credential_throttles (key text PRIMARY KEY, window_start timestamptz NOT NULL DEFAULT now(), hits integer NOT NULL DEFAULT 1);
GRANT ALL ON public.manual_credential_throttles TO service_role;
ALTER TABLE public.manual_credential_throttles ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.manual_credentials_throttle(p_key text,p_limit integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE n integer;
BEGIN
 INSERT INTO public.manual_credential_throttles(key) VALUES(p_key) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN manual_credential_throttles.window_start<now()-interval '1 hour' THEN 1 ELSE manual_credential_throttles.hits+1 END,window_start=CASE WHEN manual_credential_throttles.window_start<now()-interval '1 hour' THEN now() ELSE manual_credential_throttles.window_start END RETURNING hits INTO n;
 RETURN n<=p_limit;
END $$;
CREATE OR REPLACE FUNCTION public.manual_credentials_verify(p_email_key text,p_code_hash text,p_session_hash text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE a public.manual_credential_access%ROWTYPE;
BEGIN
 SELECT * INTO a FROM public.manual_credential_access WHERE email_key=p_email_key FOR UPDATE;
 IF NOT FOUND OR a.code_expires_at<=now() OR a.code_hash IS NULL OR a.attempts>=5 THEN RETURN false; END IF;
 UPDATE public.manual_credential_access SET attempts=attempts+1 WHERE email_key=p_email_key;
 IF a.code_hash<>p_code_hash THEN RETURN false; END IF;
 UPDATE public.manual_credential_access SET code_hash=NULL,code_expires_at=NULL,session_hash=p_session_hash,session_expires_at=now()+interval '30 minutes' WHERE email_key=p_email_key;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.manual_credentials_for_email(p_email text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,private,pg_catalog AS $$
 WITH matched AS (
 SELECT DISTINCT coalesce(l.renewal_account_id,o.id) account_id FROM private.orders o LEFT JOIN public.order_checkout_links l ON l.order_id=o.id
 WHERE (o.customer_type='manual' OR o.order_ref LIKE 'MANUAL-%') AND o.paid_at IS NOT NULL AND o.status::text<>'cancelled' AND lower(btrim(private.app_decrypt(o.email_enc)))=lower(btrim(p_email))
 ), accounts AS (
 SELECT o.id,o.shipping_name,coalesce(pc.app_login_name,cr.app_login_name) login,private.app_decrypt(coalesce(pc.password_enc,cr.password_enc)) password,coalesce(l.subscription_expiry_at,pc.expiry_at,cr.expiry_at) expiry,coalesce(pc.account_type,cr.account_type,'single') account_type
 FROM matched m JOIN private.orders o ON o.id=m.account_id LEFT JOIN public.order_checkout_links l ON l.order_id=o.id LEFT JOIN private.pending_order_credentials pc ON pc.order_id=o.id LEFT JOIN LATERAL (SELECT * FROM private.app_credentials c WHERE c.order_id=o.id ORDER BY c.created_at DESC LIMIT 1) cr ON true
 WHERE (o.customer_type='manual' OR o.order_ref LIKE 'MANUAL-%') AND o.paid_at IS NOT NULL AND o.status::text<>'cancelled'
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',shipping_name,'login',login,'password',password,'expiresAt',expiry,'accountType',account_type) ORDER BY id),'[]'::jsonb) FROM accounts;
$$;
CREATE OR REPLACE FUNCTION public.admin_manual_credentials() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,private,pg_catalog AS $$
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(c.value || jsonb_build_object('accounts',coalesce((SELECT jsonb_agg(a.value || jsonb_build_object('password',private.app_decrypt(coalesce(pc.password_enc,cr.password_enc)))) FROM jsonb_array_elements(c.value->'accounts') a(value) LEFT JOIN private.pending_order_credentials pc ON pc.order_id=(a.value->>'id')::uuid LEFT JOIN LATERAL (SELECT password_enc FROM private.app_credentials WHERE order_id=(a.value->>'id')::uuid ORDER BY created_at DESC LIMIT 1) cr ON true),'[]'::jsonb))),'[]'::jsonb) FROM jsonb_array_elements(public.admin_customer_subscription_list()) c(value) WHERE NOT coalesce((c.value->>'hasSiteAccount')::boolean,false));
END $$;
REVOKE ALL ON FUNCTION public.manual_credentials_throttle(text,integer),public.manual_credentials_verify(text,text,text),public.manual_credentials_for_email(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.manual_credentials_throttle(text,integer),public.manual_credentials_verify(text,text,text),public.manual_credentials_for_email(text) TO service_role;
REVOKE ALL ON FUNCTION public.admin_manual_credentials() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_manual_credentials() TO authenticated,service_role;