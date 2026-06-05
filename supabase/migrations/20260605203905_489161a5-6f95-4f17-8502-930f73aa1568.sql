
-- 1. Extend fan_zone_members with profile fields
ALTER TABLE public.fan_zone_members
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS supporter_since smallint,
  ADD COLUMN IF NOT EXISTS fav_player text,
  ADD COLUMN IF NOT EXISTS matchday_memory text;

-- 2. Blocks table
CREATE TABLE IF NOT EXISTS public.fan_zone_blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.fan_zone_blocks TO authenticated;
GRANT ALL ON public.fan_zone_blocks TO service_role;
ALTER TABLE public.fan_zone_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fzb own select" ON public.fan_zone_blocks FOR SELECT TO authenticated
  USING (blocker_id = auth.uid());
CREATE POLICY "fzb own insert" ON public.fan_zone_blocks FOR INSERT TO authenticated
  WITH CHECK (blocker_id = auth.uid() AND public.is_fan_zone_member(auth.uid()));
CREATE POLICY "fzb own delete" ON public.fan_zone_blocks FOR DELETE TO authenticated
  USING (blocker_id = auth.uid());

-- 3. DM threads (1-to-1). Canonicalize ordering so user_low < user_high.
CREATE TABLE IF NOT EXISTS public.fan_zone_dm_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_low uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_high uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_at timestamptz,
  last_read_low timestamptz,
  last_read_high timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_low < user_high),
  UNIQUE (user_low, user_high)
);
GRANT SELECT, UPDATE ON public.fan_zone_dm_threads TO authenticated;
GRANT ALL ON public.fan_zone_dm_threads TO service_role;
ALTER TABLE public.fan_zone_dm_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fzdt participants read" ON public.fan_zone_dm_threads FOR SELECT TO authenticated
  USING (auth.uid() IN (user_low, user_high));
CREATE POLICY "fzdt participants update" ON public.fan_zone_dm_threads FOR UPDATE TO authenticated
  USING (auth.uid() IN (user_low, user_high))
  WITH CHECK (auth.uid() IN (user_low, user_high));

-- 4. DM messages
CREATE TABLE IF NOT EXISTS public.fan_zone_dm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.fan_zone_dm_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fzdm_thread_created_idx ON public.fan_zone_dm_messages (thread_id, created_at DESC);
GRANT SELECT, INSERT ON public.fan_zone_dm_messages TO authenticated;
GRANT ALL ON public.fan_zone_dm_messages TO service_role;
ALTER TABLE public.fan_zone_dm_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fzdm participants read" ON public.fan_zone_dm_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fan_zone_dm_threads t
      WHERE t.id = thread_id AND auth.uid() IN (t.user_low, t.user_high)
    )
  );
CREATE POLICY "fzdm sender insert" ON public.fan_zone_dm_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_fan_zone_member(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.fan_zone_dm_threads t
      WHERE t.id = thread_id
        AND auth.uid() IN (t.user_low, t.user_high)
        AND NOT EXISTS (
          SELECT 1 FROM public.fan_zone_blocks b
          WHERE (b.blocker_id = t.user_low AND b.blocked_id = t.user_high)
             OR (b.blocker_id = t.user_high AND b.blocked_id = t.user_low)
        )
    )
  );

-- Trigger to bump last_message_at
CREATE OR REPLACE FUNCTION public.fan_zone_dm_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.fan_zone_dm_threads
    SET last_message_at = NEW.created_at
    WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS fan_zone_dm_after_insert ON public.fan_zone_dm_messages;
CREATE TRIGGER fan_zone_dm_after_insert AFTER INSERT ON public.fan_zone_dm_messages
  FOR EACH ROW EXECUTE FUNCTION public.fan_zone_dm_after_insert();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.fan_zone_dm_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fan_zone_dm_threads;

-- 5. RPCs

-- 5a. Update profile
CREATE OR REPLACE FUNCTION public.set_my_fan_profile(
  _alias text,
  _avatar text,
  _bio text,
  _supporter_since int,
  _fav_player text,
  _matchday_memory text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _is_staff boolean;
BEGIN
  IF _alias IS NOT NULL AND char_length(_alias) > 64 THEN RAISE EXCEPTION 'Alias too long'; END IF;
  IF _avatar IS NOT NULL AND char_length(_avatar) > 2048 THEN RAISE EXCEPTION 'Avatar URL too long'; END IF;
  IF _bio IS NOT NULL AND char_length(_bio) > 500 THEN RAISE EXCEPTION 'Bio too long (max 500)'; END IF;
  IF _fav_player IS NOT NULL AND char_length(_fav_player) > 80 THEN RAISE EXCEPTION 'Favourite player too long'; END IF;
  IF _matchday_memory IS NOT NULL AND char_length(_matchday_memory) > 280 THEN RAISE EXCEPTION 'Memory too long (max 280)'; END IF;
  IF _supporter_since IS NOT NULL AND (_supporter_since < 1876 OR _supporter_since > EXTRACT(YEAR FROM now())::int) THEN
    RAISE EXCEPTION 'Invalid supporter-since year';
  END IF;

  _is_staff := public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'boro_fan_zone_moderator'::app_role]);

  IF _is_staff THEN
    INSERT INTO public.fan_zone_members (user_id, status, fan_alias, fan_avatar_url, bio, supporter_since, fav_player, matchday_memory, decided_at)
    VALUES (auth.uid(), 'approved',
      NULLIF(btrim(_alias),''), NULLIF(btrim(_avatar),''),
      NULLIF(btrim(_bio),''), _supporter_since,
      NULLIF(btrim(_fav_player),''), NULLIF(btrim(_matchday_memory),''),
      now())
    ON CONFLICT (user_id) DO UPDATE
      SET fan_alias = NULLIF(btrim(_alias),''),
          fan_avatar_url = NULLIF(btrim(_avatar),''),
          bio = NULLIF(btrim(_bio),''),
          supporter_since = _supporter_since,
          fav_player = NULLIF(btrim(_fav_player),''),
          matchday_memory = NULLIF(btrim(_matchday_memory),''),
          status = CASE WHEN public.fan_zone_members.status = 'approved'
                        THEN public.fan_zone_members.status ELSE 'approved' END,
          decided_at = COALESCE(public.fan_zone_members.decided_at, now());
    RETURN;
  END IF;

  UPDATE public.fan_zone_members
    SET fan_alias = NULLIF(btrim(_alias),''),
        fan_avatar_url = NULLIF(btrim(_avatar),''),
        bio = NULLIF(btrim(_bio),''),
        supporter_since = _supporter_since,
        fav_player = NULLIF(btrim(_fav_player),''),
        matchday_memory = NULLIF(btrim(_matchday_memory),'')
    WHERE user_id = auth.uid() AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'Not an approved Boro Fan Zone member'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_my_fan_profile(text,text,text,int,text,text) TO authenticated;

-- 5b. Read profile (callable by any approved member / staff)
CREATE OR REPLACE FUNCTION public.get_fan_zone_profile(_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  fan_alias text,
  fan_avatar_url text,
  bio text,
  supporter_since smallint,
  fav_player text,
  matchday_memory text,
  joined_at timestamptz,
  is_blocked_by_me boolean,
  has_blocked_me boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_fan_zone_member(auth.uid())
       OR public.has_any_role(auth.uid(), ARRAY['admin','boro_fan_zone_moderator']::app_role[])) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT
    fzm.user_id,
    COALESCE(NULLIF(fzm.fan_alias,''),'Boro Fan'),
    COALESCE(NULLIF(fzm.fan_avatar_url,''), public.fan_zone_default_avatar_url()),
    fzm.bio,
    fzm.supporter_since,
    fzm.fav_player,
    fzm.matchday_memory,
    COALESCE(fzm.decided_at, fzm.requested_at),
    EXISTS (SELECT 1 FROM public.fan_zone_blocks WHERE blocker_id = auth.uid() AND blocked_id = _user_id),
    EXISTS (SELECT 1 FROM public.fan_zone_blocks WHERE blocker_id = _user_id AND blocked_id = auth.uid())
  FROM public.fan_zone_members fzm
  WHERE fzm.user_id = _user_id AND fzm.status = 'approved';
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_fan_zone_profile(uuid) TO authenticated;

-- 5c. Get or create DM thread
CREATE OR REPLACE FUNCTION public.get_or_create_fan_dm_thread(_other uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_me uuid := auth.uid(); v_low uuid; v_high uuid; v_id uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_me = _other THEN RAISE EXCEPTION 'Cannot DM yourself'; END IF;
  IF NOT public.is_fan_zone_member(v_me) THEN RAISE EXCEPTION 'Not a fan zone member'; END IF;
  IF NOT public.is_fan_zone_member(_other) THEN RAISE EXCEPTION 'Recipient is not a fan zone member'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.fan_zone_blocks
    WHERE (blocker_id = v_me AND blocked_id = _other)
       OR (blocker_id = _other AND blocked_id = v_me)
  ) THEN
    RAISE EXCEPTION 'Messaging blocked between you and this member';
  END IF;
  IF v_me < _other THEN v_low := v_me; v_high := _other;
  ELSE v_low := _other; v_high := v_me; END IF;

  SELECT id INTO v_id FROM public.fan_zone_dm_threads
    WHERE user_low = v_low AND user_high = v_high;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.fan_zone_dm_threads (user_low, user_high)
    VALUES (v_low, v_high) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_or_create_fan_dm_thread(uuid) TO authenticated;

-- 5d. List my threads with previews
CREATE OR REPLACE FUNCTION public.list_my_fan_dm_threads()
RETURNS TABLE (
  thread_id uuid,
  other_user_id uuid,
  other_alias text,
  other_avatar text,
  last_message_at timestamptz,
  last_body text,
  last_sender_id uuid,
  unread boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN QUERY
  WITH ts AS (
    SELECT t.id,
           CASE WHEN t.user_low = v_me THEN t.user_high ELSE t.user_low END AS other,
           t.last_message_at,
           CASE WHEN t.user_low = v_me THEN t.last_read_low ELSE t.last_read_high END AS my_read
    FROM public.fan_zone_dm_threads t
    WHERE v_me IN (t.user_low, t.user_high)
  ),
  last_msg AS (
    SELECT DISTINCT ON (m.thread_id) m.thread_id, m.body, m.sender_id, m.created_at
    FROM public.fan_zone_dm_messages m
    WHERE m.thread_id IN (SELECT id FROM ts)
    ORDER BY m.thread_id, m.created_at DESC
  )
  SELECT
    ts.id,
    ts.other,
    COALESCE(NULLIF(fzm.fan_alias,''),'Boro Fan'),
    COALESCE(NULLIF(fzm.fan_avatar_url,''), public.fan_zone_default_avatar_url()),
    ts.last_message_at,
    lm.body,
    lm.sender_id,
    (ts.last_message_at IS NOT NULL
      AND (ts.my_read IS NULL OR ts.my_read < ts.last_message_at)
      AND COALESCE(lm.sender_id, ts.other) <> v_me)
  FROM ts
  LEFT JOIN public.fan_zone_members fzm ON fzm.user_id = ts.other
  LEFT JOIN last_msg lm ON lm.thread_id = ts.id
  ORDER BY ts.last_message_at DESC NULLS LAST;
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_my_fan_dm_threads() TO authenticated;

-- 5e. Mark thread read
CREATE OR REPLACE FUNCTION public.mark_fan_dm_thread_read(_thread uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_me uuid := auth.uid();
BEGIN
  UPDATE public.fan_zone_dm_threads
    SET last_read_low = CASE WHEN user_low = v_me THEN now() ELSE last_read_low END,
        last_read_high = CASE WHEN user_high = v_me THEN now() ELSE last_read_high END
    WHERE id = _thread AND v_me IN (user_low, user_high);
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_fan_dm_thread_read(uuid) TO authenticated;

-- 5f. Block / unblock
CREATE OR REPLACE FUNCTION public.fan_zone_block(_other uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() = _other THEN RAISE EXCEPTION 'Bad request'; END IF;
  INSERT INTO public.fan_zone_blocks (blocker_id, blocked_id)
    VALUES (auth.uid(), _other)
    ON CONFLICT DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fan_zone_block(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fan_zone_unblock(_other uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.fan_zone_blocks WHERE blocker_id = auth.uid() AND blocked_id = _other;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fan_zone_unblock(uuid) TO authenticated;

-- 5g. List my blocks with alias info
CREATE OR REPLACE FUNCTION public.list_my_fan_blocks()
RETURNS TABLE (
  blocked_id uuid,
  fan_alias text,
  fan_avatar_url text,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.blocked_id,
    COALESCE(NULLIF(fzm.fan_alias,''),'Boro Fan'),
    COALESCE(NULLIF(fzm.fan_avatar_url,''), public.fan_zone_default_avatar_url()),
    b.created_at
  FROM public.fan_zone_blocks b
  LEFT JOIN public.fan_zone_members fzm ON fzm.user_id = b.blocked_id
  WHERE b.blocker_id = auth.uid()
  ORDER BY b.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.list_my_fan_blocks() TO authenticated;
