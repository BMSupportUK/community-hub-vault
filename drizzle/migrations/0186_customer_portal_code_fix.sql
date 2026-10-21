CREATE OR REPLACE FUNCTION public.portal_ensure_code(p_user_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_catalog AS $$
DECLARE c text;
BEGIN
 SELECT code INTO c FROM public.customer_portals WHERE user_id=p_user_id;
 IF c IS NULL THEN
  c := encode(extensions.gen_random_bytes(12),'hex');
  INSERT INTO public.customer_portals(user_id,code) VALUES(p_user_id,c) ON CONFLICT(user_id) DO NOTHING;
  SELECT code INTO c FROM public.customer_portals WHERE user_id=p_user_id;
 END IF;
 RETURN c;
END $$;
CREATE OR REPLACE FUNCTION public.admin_reset_customer_portal(p_user_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_catalog AS $$
DECLARE c text := encode(extensions.gen_random_bytes(12),'hex');
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Only admin and management can reset portal links'; END IF;
 INSERT INTO public.customer_portals(user_id,code,reset_at) VALUES(p_user_id,c,now()) ON CONFLICT(user_id) DO UPDATE SET code=EXCLUDED.code,reset_at=now();
 UPDATE public.customer_portal_links SET revoked_at=now() WHERE user_id=p_user_id AND used_at IS NULL AND revoked_at IS NULL;
 RETURN c;
END $$;