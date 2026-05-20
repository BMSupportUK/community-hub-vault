
CREATE TABLE public.user_location_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('signup','login')),
  ip text,
  country text,
  region text,
  city text,
  latitude double precision,
  longitude double precision,
  isp text,
  is_vpn boolean,
  is_proxy boolean,
  vpn_provider text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ulh_user_created ON public.user_location_history (user_id, created_at DESC);
CREATE INDEX idx_ulh_created ON public.user_location_history (created_at DESC);

ALTER TABLE public.user_location_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own location history"
  ON public.user_location_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Staff view all location history"
  ON public.user_location_history FOR SELECT
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management','moderator']::app_role[]));

-- No INSERT/UPDATE/DELETE policies; mutations go through SECURITY DEFINER RPC only.

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
  _user_agent text
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
  IF _event_type NOT IN ('signup','login') THEN RAISE EXCEPTION 'Invalid event_type'; END IF;

  INSERT INTO public.user_location_history
    (user_id, event_type, ip, country, region, city, latitude, longitude,
     isp, is_vpn, is_proxy, vpn_provider, user_agent)
  VALUES
    (v_uid, _event_type, _ip, _country, _region, _city, _latitude, _longitude,
     _isp, _is_vpn, _is_proxy, _vpn_provider, _user_agent)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_user_location_history(_user_id uuid, _limit integer DEFAULT 50)
RETURNS SETOF public.user_location_history
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','management','moderator']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT * FROM public.user_location_history
    WHERE user_id = _user_id
    ORDER BY created_at DESC
    LIMIT GREATEST(1, LEAST(_limit, 500));
END;
$$;
