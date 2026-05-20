ALTER TABLE public.signup_info
  ADD COLUMN IF NOT EXISTS signed_up_via_vpn boolean;

-- Seed historical flag from current data for existing rows
UPDATE public.signup_info
SET signed_up_via_vpn = COALESCE(is_vpn, false) OR COALESCE(is_proxy, false)
WHERE signed_up_via_vpn IS NULL;

CREATE OR REPLACE FUNCTION public.upsert_my_signup_vpn(_ip text, _is_vpn boolean, _is_proxy boolean, _vpn_provider text, _isp text, _country text, _region text, _city text, _vpn_raw jsonb)
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
    OR lower(COALESCE(_vpn_raw->>'proxy', '')) = 'yes'
    OR v_detected_vpn;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.signup_info (user_id, ip, is_vpn, is_proxy, vpn_provider, isp, country, region, city, vpn_raw, signed_up_via_vpn)
  VALUES (v_uid, _ip, v_detected_vpn, v_detected_proxy, _vpn_provider, _isp, _country, _region, _city, _vpn_raw, v_detected_vpn OR v_detected_proxy)
  ON CONFLICT (user_id) DO UPDATE SET
    ip = COALESCE(EXCLUDED.ip, public.signup_info.ip),
    is_vpn = v_detected_vpn,
    is_proxy = v_detected_proxy,
    vpn_provider = CASE WHEN v_detected_vpn OR v_detected_proxy THEN EXCLUDED.vpn_provider ELSE NULL END,
    isp = COALESCE(EXCLUDED.isp, public.signup_info.isp),
    country = COALESCE(EXCLUDED.country, public.signup_info.country),
    region = COALESCE(EXCLUDED.region, public.signup_info.region),
    city = COALESCE(EXCLUDED.city, public.signup_info.city),
    vpn_raw = COALESCE(EXCLUDED.vpn_raw, public.signup_info.vpn_raw),
    signed_up_via_vpn = COALESCE(public.signup_info.signed_up_via_vpn, v_detected_vpn OR v_detected_proxy);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_signup_vpn(_user_id uuid, _ip text, _is_vpn boolean, _is_proxy boolean, _vpn_provider text, _isp text, _country text, _region text, _city text, _vpn_raw jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_detected_vpn boolean := COALESCE(_is_vpn, false)
    OR lower(COALESCE(_vpn_provider, '')) LIKE '%vpn%'
    OR lower(COALESCE(_vpn_raw->>'type', '')) = 'vpn'
    OR lower(COALESCE(_vpn_raw #>> '{operator,name}', '')) LIKE '%vpn%';
  v_detected_proxy boolean := COALESCE(_is_proxy, false)
    OR lower(COALESCE(_vpn_raw->>'proxy', '')) = 'yes'
    OR v_detected_vpn;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.signup_info (user_id, ip, is_vpn, is_proxy, vpn_provider, isp, country, region, city, vpn_raw, signed_up_via_vpn)
  VALUES (_user_id, _ip, v_detected_vpn, v_detected_proxy, _vpn_provider, _isp, _country, _region, _city, _vpn_raw, v_detected_vpn OR v_detected_proxy)
  ON CONFLICT (user_id) DO UPDATE SET
    ip = COALESCE(EXCLUDED.ip, public.signup_info.ip),
    is_vpn = v_detected_vpn,
    is_proxy = v_detected_proxy,
    vpn_provider = CASE WHEN v_detected_vpn OR v_detected_proxy THEN EXCLUDED.vpn_provider ELSE NULL END,
    isp = COALESCE(EXCLUDED.isp, public.signup_info.isp),
    country = COALESCE(EXCLUDED.country, public.signup_info.country),
    region = COALESCE(EXCLUDED.region, public.signup_info.region),
    city = COALESCE(EXCLUDED.city, public.signup_info.city),
    vpn_raw = COALESCE(EXCLUDED.vpn_raw, public.signup_info.vpn_raw),
    signed_up_via_vpn = COALESCE(public.signup_info.signed_up_via_vpn, v_detected_vpn OR v_detected_proxy);
END;
$function$;