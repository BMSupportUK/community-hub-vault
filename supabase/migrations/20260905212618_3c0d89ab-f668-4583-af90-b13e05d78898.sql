CREATE TABLE public.fan_zone_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  banned_by uuid,
  reason text NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fan_zone_bans TO authenticated;
GRANT ALL ON public.fan_zone_bans TO service_role;

ALTER TABLE public.fan_zone_bans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own bans" ON public.fan_zone_bans
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Staff read all bans" ON public.fan_zone_bans
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management','moderator','boro_fan_zone_moderator']::app_role[]));

CREATE INDEX fan_zone_bans_user_active ON public.fan_zone_bans (user_id, expires_at);

CREATE TRIGGER fan_zone_bans_touch
  BEFORE UPDATE ON public.fan_zone_bans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Live ban for a member (permanent when expires_at is null).
CREATE OR REPLACE FUNCTION public.fan_zone_active_ban(_user_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  reason text,
  expires_at timestamptz,
  banned_by uuid,
  banned_by_name text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.user_id, b.reason, b.expires_at, b.banned_by,
         COALESCE(bd.fan_alias, 'Boro Fan Zone moderator') AS banned_by_name,
         b.created_at
  FROM public.fan_zone_bans b
  LEFT JOIN public.fan_zone_members bd ON bd.user_id = b.banned_by
  WHERE b.user_id = _user_id
    AND (b.expires_at IS NULL OR b.expires_at > now())
    AND (
      _user_id = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['admin','management','moderator','boro_fan_zone_moderator']::app_role[])
    )
  ORDER BY (b.expires_at IS NULL) DESC, b.expires_at DESC
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.fan_zone_active_ban(uuid) FROM anon;

-- Ban a member from the Boro Fan Zone. _minutes null = permanent.
CREATE OR REPLACE FUNCTION public.fan_zone_ban(_user_id uuid, _minutes integer, _reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_id uuid;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','management','moderator','boro_fan_zone_moderator']::app_role[]) THEN
    RAISE EXCEPTION 'Only Boro Fan Zone staff can ban members';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot ban yourself';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = ANY (ARRAY['admin','management','moderator','boro_fan_zone_moderator']::app_role[])
  ) THEN
    RAISE EXCEPTION 'Boro Fan Zone staff cannot be banned';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;
  IF _minutes IS NOT NULL AND (_minutes < 1 OR _minutes > 525600) THEN
    RAISE EXCEPTION 'Ban length must be between 1 minute and 1 year';
  END IF;

  DELETE FROM public.fan_zone_bans
  WHERE user_id = _user_id AND (expires_at IS NULL OR expires_at > now());

  INSERT INTO public.fan_zone_bans (user_id, banned_by, reason, expires_at)
  VALUES (
    _user_id,
    auth.uid(),
    left(btrim(_reason), 1000),
    CASE WHEN _minutes IS NULL THEN NULL ELSE now() + make_interval(mins => _minutes) END
  )
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fan_zone_ban(uuid, integer, text) FROM anon;

CREATE OR REPLACE FUNCTION public.fan_zone_unban(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','management','moderator','boro_fan_zone_moderator']::app_role[]) THEN
    RAISE EXCEPTION 'Only Boro Fan Zone staff can lift a ban';
  END IF;
  DELETE FROM public.fan_zone_bans
  WHERE user_id = _user_id AND (expires_at IS NULL OR expires_at > now());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fan_zone_unban(uuid) FROM anon;

-- Block banned members from writing anywhere in the Fan Zone.
CREATE OR REPLACE FUNCTION public.block_banned_fan_zone_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _until timestamptz;
  _found boolean;
BEGIN
  SELECT b.expires_at, true INTO _until, _found
  FROM public.fan_zone_bans b
  WHERE b.user_id = auth.uid()
    AND (b.expires_at IS NULL OR b.expires_at > now())
  ORDER BY (b.expires_at IS NULL) DESC, b.expires_at DESC
  LIMIT 1;

  IF _found THEN
    IF _until IS NULL THEN
      RAISE EXCEPTION 'You are permanently banned from the Boro Fan Zone';
    ELSE
      RAISE EXCEPTION 'You are banned from the Boro Fan Zone until %', _until;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.block_banned_fan_zone_write() FROM anon, authenticated;

CREATE TRIGGER block_banned_forum_posts
  BEFORE INSERT ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION public.block_banned_fan_zone_write();

CREATE TRIGGER block_banned_forum_topics
  BEFORE INSERT ON public.forum_topics
  FOR EACH ROW EXECUTE FUNCTION public.block_banned_fan_zone_write();

CREATE TRIGGER block_banned_fan_zone_dms
  BEFORE INSERT ON public.fan_zone_dm_messages
  FOR EACH ROW EXECUTE FUNCTION public.block_banned_fan_zone_write();