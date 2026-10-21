CREATE TABLE public.customer_portals (user_id uuid PRIMARY KEY, code text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), reset_at timestamptz);
GRANT ALL ON public.customer_portals TO service_role;
ALTER TABLE public.customer_portals ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.customer_portal_links (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, token_hash text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours', used_at timestamptz, revoked_at timestamptz);
CREATE INDEX customer_portal_links_user_idx ON public.customer_portal_links(user_id, created_at DESC);
GRANT ALL ON public.customer_portal_links TO service_role;
ALTER TABLE public.customer_portal_links ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.portal_ensure_code(p_user_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE c text;
BEGIN
 SELECT code INTO c FROM public.customer_portals WHERE user_id=p_user_id;
 IF c IS NULL THEN
  c := encode(gen_random_bytes(12),'hex');
  INSERT INTO public.customer_portals(user_id,code) VALUES(p_user_id,c) ON CONFLICT(user_id) DO NOTHING;
  SELECT code INTO c FROM public.customer_portals WHERE user_id=p_user_id;
 END IF;
 RETURN c;
END $$;
REVOKE ALL ON FUNCTION public.portal_ensure_code(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.portal_ensure_code(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_customer_portal_code() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 RETURN public.portal_ensure_code(auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.get_my_customer_portal_code() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_customer_portal_code() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_customer_portal_code(p_user_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management','staff']::public.app_role[]) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN public.portal_ensure_code(p_user_id);
END $$;
REVOKE ALL ON FUNCTION public.admin_customer_portal_code(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_customer_portal_code(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reset_customer_portal(p_user_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE c text := encode(gen_random_bytes(12),'hex');
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Only admin and management can reset portal links'; END IF;
 INSERT INTO public.customer_portals(user_id,code,reset_at) VALUES(p_user_id,c,now()) ON CONFLICT(user_id) DO UPDATE SET code=EXCLUDED.code,reset_at=now();
 UPDATE public.customer_portal_links SET revoked_at=now() WHERE user_id=p_user_id AND used_at IS NULL AND revoked_at IS NULL;
 RETURN c;
END $$;
REVOKE ALL ON FUNCTION public.admin_reset_customer_portal(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_customer_portal(uuid) TO authenticated;

-- Issue a login link: revokes older unused links so only the newest works.
CREATE OR REPLACE FUNCTION public.portal_issue_link(p_user_id uuid,p_token_hash text) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE e timestamptz;
BEGIN
 UPDATE public.customer_portal_links SET revoked_at=now() WHERE user_id=p_user_id AND used_at IS NULL AND revoked_at IS NULL;
 INSERT INTO public.customer_portal_links(user_id,token_hash) VALUES(p_user_id,p_token_hash) RETURNING expires_at INTO e;
 RETURN e;
END $$;
-- Redeem: one use, within 24 hours, not revoked.
CREATE OR REPLACE FUNCTION public.portal_redeem_link(p_token_hash text) RETURNS TABLE(user_id uuid, expires_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
BEGIN
 RETURN QUERY UPDATE public.customer_portal_links l SET used_at=now() WHERE l.token_hash=p_token_hash AND l.used_at IS NULL AND l.revoked_at IS NULL AND l.expires_at>now() RETURNING l.user_id, l.expires_at;
END $$;
REVOKE ALL ON FUNCTION public.portal_issue_link(uuid,text),public.portal_redeem_link(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.portal_issue_link(uuid,text),public.portal_redeem_link(text) TO service_role;

-- Site-account credentials for a user's own paid orders.
CREATE OR REPLACE FUNCTION public.portal_credentials_for_user(p_user_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,private,pg_catalog AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.shipping_name,'login',coalesce(pc.app_login_name,cr.app_login_name),'password',private.app_decrypt(coalesce(pc.password_enc,cr.password_enc)),'expiresAt',coalesce(l.subscription_expiry_at,pc.expiry_at,cr.expiry_at),'accountType',coalesce(pc.account_type,cr.account_type,'single')) ORDER BY o.created_at DESC),'[]'::jsonb)
 FROM private.orders o LEFT JOIN public.order_checkout_links l ON l.order_id=o.id LEFT JOIN private.pending_order_credentials pc ON pc.order_id=o.id
 LEFT JOIN LATERAL (SELECT * FROM private.app_credentials c WHERE c.order_id=o.id ORDER BY c.created_at DESC LIMIT 1) cr ON true
 WHERE o.user_id=p_user_id AND o.paid_at IS NOT NULL AND o.status::text<>'cancelled' AND coalesce(pc.app_login_name,cr.app_login_name) IS NOT NULL;
$$;
-- PIN check for an email-verified portal session. Same five-try, one-hour lock as manual access; first use sets the PIN.
CREATE OR REPLACE FUNCTION public.portal_verify_pin(p_email_key text,p_pin_hash text,p_pin_salt text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE a public.manual_credential_access%ROWTYPE;
BEGIN
 IF p_pin_hash IS NULL OR length(p_pin_hash)<>64 OR p_pin_salt IS NULL OR length(p_pin_salt)<>48 THEN RETURN 'invalid'; END IF;
 INSERT INTO public.manual_credential_access(email_key) VALUES(p_email_key) ON CONFLICT DO NOTHING;
 SELECT * INTO a FROM public.manual_credential_access WHERE email_key=p_email_key FOR UPDATE;
 IF a.pin_locked_until>now() THEN RETURN 'locked'; END IF;
 IF a.pin_hash IS NULL THEN
  UPDATE public.manual_credential_access SET pin_hash=p_pin_hash,pin_salt=p_pin_salt,pin_attempts=0,pin_locked_until=NULL WHERE email_key=p_email_key;
  RETURN 'created';
 END IF;
 IF a.pin_salt<>p_pin_salt OR a.pin_hash<>p_pin_hash THEN
  UPDATE public.manual_credential_access SET pin_attempts=CASE WHEN coalesce(a.pin_locked_until,now())<=now() AND a.pin_locked_until IS NOT NULL THEN 1 ELSE pin_attempts+1 END,pin_locked_until=CASE WHEN a.pin_attempts+1>=5 THEN now()+interval '1 hour' ELSE NULL END WHERE email_key=p_email_key;
  RETURN 'invalid';
 END IF;
 UPDATE public.manual_credential_access SET pin_attempts=0,pin_locked_until=NULL WHERE email_key=p_email_key;
 RETURN 'verified';
END $$;
REVOKE ALL ON FUNCTION public.portal_credentials_for_user(uuid),public.portal_verify_pin(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.portal_credentials_for_user(uuid),public.portal_verify_pin(text,text,text) TO service_role;