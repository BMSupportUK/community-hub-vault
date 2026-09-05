CREATE TABLE IF NOT EXISTS public.fan_zone_mutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  muted_by uuid,
  reason text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fan_zone_mutes_user_active ON public.fan_zone_mutes (user_id, expires_at DESC);

GRANT SELECT ON public.fan_zone_mutes TO authenticated;
GRANT ALL ON public.fan_zone_mutes TO service_role;

ALTER TABLE public.fan_zone_mutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own mutes" ON public.fan_zone_mutes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Staff read all mutes" ON public.fan_zone_mutes
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role,'boro_fan_zone_moderator'::app_role]));

CREATE TRIGGER fan_zone_mutes_touch
  BEFORE UPDATE ON public.fan_zone_mutes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Is this user muted right now?  Returns the live mute or nothing.
CREATE OR REPLACE FUNCTION public.fan_zone_active_mute(_user_id uuid DEFAULT auth.uid())
RETURNS TABLE (id uuid, user_id uuid, reason text, expires_at timestamptz, muted_by uuid, muted_by_name text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.user_id, m.reason, m.expires_at, m.muted_by,
         COALESCE(md.fan_alias, 'Boro Fan Zone moderator') AS muted_by_name,
         m.created_at
  FROM public.fan_zone_mutes m
  LEFT JOIN public.fan_zone_members md ON md.user_id = m.muted_by
  WHERE m.expires_at > now()
    AND m.user_id = COALESCE(_user_id, auth.uid())
    AND (
      COALESCE(_user_id, auth.uid()) = auth.uid()
      OR has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role,'boro_fan_zone_moderator'::app_role])
    )
  ORDER BY m.expires_at DESC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.fan_zone_active_mute(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fan_zone_active_mute(uuid) TO authenticated;

-- Staff: mute a member for a number of minutes with a reason.
CREATE OR REPLACE FUNCTION public.fan_zone_mute(_user_id uuid, _minutes integer, _reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role,'boro_fan_zone_moderator'::app_role]) THEN
    RAISE EXCEPTION 'Only moderators can mute members';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot mute yourself';
  END IF;
  IF has_any_role(_user_id, ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role,'boro_fan_zone_moderator'::app_role]) THEN
    RAISE EXCEPTION 'Moderators and admins cannot be muted';
  END IF;
  IF COALESCE(_minutes, 0) < 1 OR _minutes > 525600 THEN
    RAISE EXCEPTION 'Mute length must be between 1 minute and 1 year';
  END IF;
  IF COALESCE(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  DELETE FROM public.fan_zone_mutes WHERE user_id = _user_id AND expires_at > now();

  INSERT INTO public.fan_zone_mutes (user_id, muted_by, reason, expires_at)
  VALUES (_user_id, auth.uid(), btrim(left(_reason, 1000)), now() + make_interval(mins => _minutes))
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.fan_zone_mute(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fan_zone_mute(uuid, integer, text) TO authenticated;

-- Staff: end a mute early.
CREATE OR REPLACE FUNCTION public.fan_zone_unmute(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role,'boro_fan_zone_moderator'::app_role]) THEN
    RAISE EXCEPTION 'Only moderators can unmute members';
  END IF;
  DELETE FROM public.fan_zone_mutes WHERE user_id = _user_id AND expires_at > now();
END;
$$;

REVOKE ALL ON FUNCTION public.fan_zone_unmute(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fan_zone_unmute(uuid) TO authenticated;

-- Server-side enforcement: muted members can't post in the Fan Zone.
CREATE OR REPLACE FUNCTION public.block_muted_fan_zone_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _until timestamptz;
BEGIN
  SELECT max(expires_at) INTO _until
  FROM public.fan_zone_mutes
  WHERE user_id = auth.uid() AND expires_at > now();

  IF _until IS NOT NULL THEN
    RAISE EXCEPTION 'You are muted in the Boro Fan Zone until %', _until;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS forum_posts_block_muted ON public.forum_posts;
CREATE TRIGGER forum_posts_block_muted
  BEFORE INSERT ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION public.block_muted_fan_zone_write();

DROP TRIGGER IF EXISTS forum_topics_block_muted ON public.forum_topics;
CREATE TRIGGER forum_topics_block_muted
  BEFORE INSERT ON public.forum_topics
  FOR EACH ROW EXECUTE FUNCTION public.block_muted_fan_zone_write();

DROP TRIGGER IF EXISTS fan_zone_dm_block_muted ON public.fan_zone_dm_messages;
CREATE TRIGGER fan_zone_dm_block_muted
  BEFORE INSERT ON public.fan_zone_dm_messages
  FOR EACH ROW EXECUTE FUNCTION public.block_muted_fan_zone_write();