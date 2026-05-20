
ALTER TABLE public.user_location_history
  ADD COLUMN IF NOT EXISTS accuracy_m double precision;

ALTER TABLE public.user_location_history
  DROP CONSTRAINT IF EXISTS user_location_history_event_type_check;
ALTER TABLE public.user_location_history
  ADD CONSTRAINT user_location_history_event_type_check
  CHECK (event_type IN ('signup','login','gps'));

CREATE OR REPLACE FUNCTION public.insert_my_location_event(
  _event_type text,
  _ip text,
  _country text,
  _region text,
  _city text,
  _latitude double precision,
  _longitude double precision,
  _isp text,
  _is_vpn boolean,
  _is_proxy boolean,
  _vpn_provider text,
  _user_agent text,
  _accuracy_m double precision DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _event_type NOT IN ('signup','login','gps') THEN RAISE EXCEPTION 'Invalid event_type'; END IF;

  INSERT INTO public.user_location_history
    (user_id, event_type, ip, country, region, city, latitude, longitude,
     isp, is_vpn, is_proxy, vpn_provider, user_agent, accuracy_m)
  VALUES
    (v_uid, _event_type, _ip, _country, _region, _city, _latitude, _longitude,
     _isp, _is_vpn, _is_proxy, _vpn_provider, _user_agent, _accuracy_m)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
