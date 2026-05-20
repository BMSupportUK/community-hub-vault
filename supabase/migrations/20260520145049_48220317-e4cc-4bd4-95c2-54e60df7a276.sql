
-- Admin-only RPC: list most recent known IP per user, combining signup_info and decrypted user IP logs
CREATE OR REPLACE FUNCTION public.admin_list_user_ips_for_vpn_backfill()
RETURNS TABLE(user_id uuid, ip text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH latest_logs AS (
    SELECT DISTINCT ON (l.user_id) l.user_id, public.app_decrypt(l.ip_enc) AS ip
    FROM private.user_ip_logs l
    ORDER BY l.user_id, l.created_at DESC
  )
  SELECT p.id AS user_id,
         COALESCE(NULLIF(si.ip, ''), ll.ip) AS ip
  FROM public.profiles p
  LEFT JOIN public.signup_info si ON si.user_id = p.id
  LEFT JOIN latest_logs ll ON ll.user_id = p.id
  WHERE COALESCE(NULLIF(si.ip, ''), ll.ip) IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_user_ips_for_vpn_backfill() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_user_ips_for_vpn_backfill() TO authenticated;

-- Admin-only RPC: upsert VPN/proxy flags into signup_info for a given user
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
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.signup_info (user_id, ip, is_vpn, is_proxy, vpn_provider, isp, country, region, city, vpn_raw)
  VALUES (_user_id, _ip, _is_vpn, _is_proxy, _vpn_provider, _isp, _country, _region, _city, _vpn_raw)
  ON CONFLICT (user_id) DO UPDATE SET
    ip = COALESCE(EXCLUDED.ip, public.signup_info.ip),
    is_vpn = EXCLUDED.is_vpn,
    is_proxy = EXCLUDED.is_proxy,
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
