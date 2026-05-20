CREATE OR REPLACE FUNCTION public.upsert_my_signup_vpn(
  _ip text,
  _is_vpn boolean,
  _is_proxy boolean,
  _vpn_provider text,
  _isp text,
  _country text,
  _region text,
  _city text,
  _vpn_raw jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_detected_vpn boolean := COALESCE(_is_vpn, false)
    OR lower(COALESCE(_vpn_provider, '')) LIKE '%vpn%'
    OR lower(COALESCE(_vpn_raw->>'type', '')) = 'vpn'
    OR lower(COALESCE(_vpn_raw #>> '{operator,name}', '')) LIKE '%vpn%';
  v_detected_proxy boolean := COALESCE(_is_proxy, false)
    OR COALESCE(_is_vpn, false)
    OR lower(COALESCE(_vpn_raw->>'proxy', '')) = 'yes'
    OR v_detected_vpn;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.signup_info (user_id, ip, is_vpn, is_proxy, vpn_provider, isp, country, region, city, vpn_raw)
  VALUES (v_uid, _ip, v_detected_vpn, v_detected_proxy, _vpn_provider, _isp, _country, _region, _city, _vpn_raw)
  ON CONFLICT (user_id) DO UPDATE SET
    ip = COALESCE(EXCLUDED.ip, public.signup_info.ip),
    is_vpn = COALESCE(public.signup_info.is_vpn, false) OR v_detected_vpn,
    is_proxy = COALESCE(public.signup_info.is_proxy, false) OR v_detected_proxy,
    vpn_provider = COALESCE(EXCLUDED.vpn_provider, public.signup_info.vpn_provider),
    isp = COALESCE(EXCLUDED.isp, public.signup_info.isp),
    country = COALESCE(EXCLUDED.country, public.signup_info.country),
    region = COALESCE(EXCLUDED.region, public.signup_info.region),
    city = COALESCE(EXCLUDED.city, public.signup_info.city),
    vpn_raw = COALESCE(EXCLUDED.vpn_raw, public.signup_info.vpn_raw);
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_my_signup_vpn(text, boolean, boolean, text, text, text, text, text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.upsert_my_signup_vpn(text, boolean, boolean, text, text, text, text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_signup_vpn(
  _user_id uuid,
  _ip text,
  _is_vpn boolean,
  _is_proxy boolean,
  _vpn_provider text,
  _isp text,
  _country text,
  _region text,
  _city text,
  _vpn_raw jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_detected_vpn boolean := COALESCE(_is_vpn, false)
    OR lower(COALESCE(_vpn_provider, '')) LIKE '%vpn%'
    OR lower(COALESCE(_vpn_raw->>'type', '')) = 'vpn'
    OR lower(COALESCE(_vpn_raw #>> '{operator,name}', '')) LIKE '%vpn%';
  v_detected_proxy boolean := COALESCE(_is_proxy, false)
    OR COALESCE(_is_vpn, false)
    OR lower(COALESCE(_vpn_raw->>'proxy', '')) = 'yes'
    OR v_detected_vpn;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.signup_info (user_id, ip, is_vpn, is_proxy, vpn_provider, isp, country, region, city, vpn_raw)
  VALUES (_user_id, _ip, v_detected_vpn, v_detected_proxy, _vpn_provider, _isp, _country, _region, _city, _vpn_raw)
  ON CONFLICT (user_id) DO UPDATE SET
    ip = COALESCE(EXCLUDED.ip, public.signup_info.ip),
    is_vpn = COALESCE(public.signup_info.is_vpn, false) OR v_detected_vpn,
    is_proxy = COALESCE(public.signup_info.is_proxy, false) OR v_detected_proxy,
    vpn_provider = COALESCE(EXCLUDED.vpn_provider, public.signup_info.vpn_provider),
    isp = COALESCE(EXCLUDED.isp, public.signup_info.isp),
    country = COALESCE(EXCLUDED.country, public.signup_info.country),
    region = COALESCE(EXCLUDED.region, public.signup_info.region),
    city = COALESCE(EXCLUDED.city, public.signup_info.city),
    vpn_raw = COALESCE(EXCLUDED.vpn_raw, public.signup_info.vpn_raw);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_signup_vpn(uuid, text, boolean, boolean, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_signup_vpn(uuid, text, boolean, boolean, text, text, text, text, text, jsonb) TO authenticated;