ALTER TABLE public.fan_zone_members
  ADD COLUMN IF NOT EXISTS privacy_audience text NOT NULL DEFAULT 'friends';

ALTER TABLE public.fan_zone_members
  DROP CONSTRAINT IF EXISTS fan_zone_members_privacy_audience_check;
ALTER TABLE public.fan_zone_members
  ADD CONSTRAINT fan_zone_members_privacy_audience_check
  CHECK (privacy_audience IN ('friends','selected','nobody'));

CREATE TABLE IF NOT EXISTS public.fan_zone_profile_viewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  viewer_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, viewer_id)
);

GRANT SELECT, INSERT, DELETE ON public.fan_zone_profile_viewers TO authenticated;
GRANT ALL ON public.fan_zone_profile_viewers TO service_role;

ALTER TABLE public.fan_zone_profile_viewers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage their allowed viewers" ON public.fan_zone_profile_viewers;
CREATE POLICY "Owners manage their allowed viewers"
ON public.fan_zone_profile_viewers FOR ALL TO authenticated
USING (owner_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','boro_fan_zone_moderator']::app_role[]))
WITH CHECK (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.fan_zone_can_view_profile(_owner uuid, _viewer uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
        AND ((requester_id = _owner AND addressee_id = _viewer)
          OR (requester_id = _viewer AND addressee_id = _owner))
    );
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.fan_zone_privacy(uuid[]);
CREATE FUNCTION public.fan_zone_privacy(_ids uuid[])
RETURNS TABLE(user_id uuid, is_private boolean, privacy_audience text, can_view boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    u AS user_id,
    COALESCE(fzm.is_private, false) AS is_private,
    COALESCE(fzm.privacy_audience, 'friends') AS privacy_audience,
    public.fan_zone_can_view_profile(u, auth.uid()) AS can_view
  FROM unnest(_ids) AS u
  LEFT JOIN public.fan_zone_members fzm ON fzm.user_id = u
  WHERE public.is_fan_zone_member(auth.uid())
     OR public.has_any_role(auth.uid(), ARRAY['admin','boro_fan_zone_moderator']::app_role[]);
$$;

DROP FUNCTION IF EXISTS public.fan_zone_set_privacy(boolean);
CREATE FUNCTION public.fan_zone_set_privacy(_private boolean, _audience text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _audience IS NOT NULL AND _audience NOT IN ('friends','selected','nobody') THEN
    RAISE EXCEPTION 'Invalid audience';
  END IF;

  UPDATE public.fan_zone_members
  SET is_private = COALESCE(_private, false),
      privacy_audience = COALESCE(_audience, privacy_audience, 'friends'),
      updated_at = now()
  WHERE user_id = auth.uid();

  RETURN COALESCE(_private, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.fan_zone_set_profile_viewers(_viewers uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM public.fan_zone_profile_viewers
  WHERE owner_id = auth.uid()
    AND viewer_id <> ALL (COALESCE(_viewers, ARRAY[]::uuid[]));

  INSERT INTO public.fan_zone_profile_viewers (owner_id, viewer_id)
  SELECT auth.uid(), v
  FROM unnest(COALESCE(_viewers, ARRAY[]::uuid[])) AS v
  WHERE v <> auth.uid()
  ON CONFLICT (owner_id, viewer_id) DO NOTHING;

  SELECT count(*) INTO _n FROM public.fan_zone_profile_viewers WHERE owner_id = auth.uid();
  RETURN _n;
END;
$$;

DROP FUNCTION IF EXISTS public.get_fan_zone_profile(uuid);
CREATE FUNCTION public.get_fan_zone_profile(_user_id uuid)
RETURNS TABLE(user_id uuid, fan_alias text, fan_avatar_url text, bio text, supporter_since smallint, fav_player text, matchday_memory text, joined_at timestamp with time zone, is_blocked_by_me boolean, has_blocked_me boolean, is_private boolean, can_view boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
    public.is_fan_zone_member(auth.uid())
    OR public.has_any_role(auth.uid(), ARRAY['admin','boro_fan_zone_moderator']::app_role[])
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    COALESCE(NULLIF(btrim(fzm.fan_alias), ''), 'Boro Fan') AS fan_alias,
    COALESCE(NULLIF(fzm.fan_avatar_url, ''), public.fan_zone_default_avatar_url()) AS fan_avatar_url,
    fzm.bio,
    fzm.supporter_since,
    fzm.fav_player,
    fzm.matchday_memory,
    COALESCE(fzm.decided_at, fzm.requested_at, p.created_at) AS joined_at,
    EXISTS (
      SELECT 1 FROM public.fan_zone_blocks
      WHERE blocker_id = auth.uid() AND blocked_id = _user_id
    ) AS is_blocked_by_me,
    EXISTS (
      SELECT 1 FROM public.fan_zone_blocks
      WHERE blocker_id = _user_id AND blocked_id = auth.uid()
    ) AS has_blocked_me,
    COALESCE(fzm.is_private, false) AS is_private,
    public.fan_zone_can_view_profile(p.id, auth.uid()) AS can_view
  FROM public.profiles p
  LEFT JOIN public.fan_zone_members fzm
    ON fzm.user_id = p.id AND fzm.status = 'approved'
  WHERE p.id = _user_id
    AND (
      fzm.user_id IS NOT NULL
      OR public.has_any_role(p.id, ARRAY['admin','boro_fan_zone_moderator']::app_role[])
    );
END;
$$;