CREATE OR REPLACE FUNCTION public.fan_zone_can_view_profile(_owner uuid, _viewer uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _private boolean;
  _audience text;
BEGIN
  IF _owner IS NULL THEN RETURN false; END IF;
  IF _viewer IS NOT NULL AND _owner = _viewer THEN RETURN true; END IF;
  IF public.has_any_role(_viewer, ARRAY['admin','boro_fan_zone_moderator']::app_role[]) THEN
    RETURN true;
  END IF;

  SELECT COALESCE(is_private, false), COALESCE(privacy_audience, 'friends')
    INTO _private, _audience
  FROM public.fan_zone_members
  WHERE user_id = _owner;

  IF _private IS NULL OR _private = false THEN RETURN true; END IF;
  IF _viewer IS NULL THEN RETURN false; END IF;

  IF _audience = 'nobody' THEN
    RETURN false;
  ELSIF _audience = 'selected' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.fan_zone_profile_viewers
      WHERE owner_id = _owner AND viewer_id = _viewer
    );
  ELSE
    RETURN EXISTS (
      SELECT 1 FROM public.fan_zone_friendships
      WHERE status = 'accepted'
        AND requester_id = _owner
        AND addressee_id = _viewer
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fan_zone_can_view_profile(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fan_zone_can_view_profile(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fan_zone_can_view_profile(uuid, uuid) TO service_role;