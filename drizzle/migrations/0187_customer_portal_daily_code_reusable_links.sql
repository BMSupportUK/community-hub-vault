ALTER TABLE public.customer_portals ADD COLUMN IF NOT EXISTS code_set_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.customer_portals ADD COLUMN IF NOT EXISTS previous_code text;
UPDATE public.customer_portals SET code_set_at = coalesce(reset_at, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS customer_portals_previous_code_idx ON public.customer_portals(previous_code) WHERE previous_code IS NOT NULL;

-- Portal codes change every 24 hours; the previous code may only request a fresh login link.
CREATE OR REPLACE FUNCTION public.portal_ensure_code(p_user_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_catalog AS $$
DECLARE r public.customer_portals%ROWTYPE; c text;
BEGIN
 SELECT * INTO r FROM public.customer_portals WHERE user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN
  c := encode(extensions.gen_random_bytes(12),'hex');
  INSERT INTO public.customer_portals(user_id,code,code_set_at) VALUES(p_user_id,c,now()) ON CONFLICT(user_id) DO NOTHING;
  SELECT code INTO c FROM public.customer_portals WHERE user_id=p_user_id;
  RETURN c;
 END IF;
 IF r.code_set_at <= now() - interval '24 hours' THEN
  c := encode(extensions.gen_random_bytes(12),'hex');
  UPDATE public.customer_portals SET previous_code=r.code, code=c, code_set_at=now() WHERE user_id=p_user_id;
  RETURN c;
 END IF;
 RETURN r.code;
END $$;
REVOKE ALL ON FUNCTION public.portal_ensure_code(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.portal_ensure_code(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_reset_customer_portal(p_user_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_catalog AS $$
DECLARE c text := encode(extensions.gen_random_bytes(12),'hex');
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Only admin and management can reset portal links'; END IF;
 INSERT INTO public.customer_portals(user_id,code,reset_at,code_set_at) VALUES(p_user_id,c,now(),now())
  ON CONFLICT(user_id) DO UPDATE SET code=EXCLUDED.code,reset_at=now(),code_set_at=now(),previous_code=NULL;
 UPDATE public.customer_portal_links SET revoked_at=now() WHERE user_id=p_user_id AND revoked_at IS NULL;
 RETURN c;
END $$;
REVOKE ALL ON FUNCTION public.admin_reset_customer_portal(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_customer_portal(uuid) TO authenticated;

-- Issuing a link revokes every older link so only the newest works.
CREATE OR REPLACE FUNCTION public.portal_issue_link(p_user_id uuid,p_token_hash text) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE e timestamptz;
BEGIN
 UPDATE public.customer_portal_links SET revoked_at=now() WHERE user_id=p_user_id AND revoked_at IS NULL;
 INSERT INTO public.customer_portal_links(user_id,token_hash) VALUES(p_user_id,p_token_hash) RETURNING expires_at INTO e;
 RETURN e;
END $$;
-- Redeem: reusable for its 24 hours unless revoked; each opening locks again after an hour (client side).
CREATE OR REPLACE FUNCTION public.portal_redeem_link(p_token_hash text) RETURNS TABLE(user_id uuid, expires_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
BEGIN
 RETURN QUERY UPDATE public.customer_portal_links l SET used_at=coalesce(l.used_at,now()) WHERE l.token_hash=p_token_hash AND l.revoked_at IS NULL AND l.expires_at>now() RETURNING l.user_id, l.expires_at;
END $$;
REVOKE ALL ON FUNCTION public.portal_issue_link(uuid,text),public.portal_redeem_link(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.portal_issue_link(uuid,text),public.portal_redeem_link(text) TO service_role;