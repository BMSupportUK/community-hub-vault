
-- 1. Drop existing Boro Fan Zone chat channels (replacing with forum)
DELETE FROM public.chat_messages WHERE channel_id IN (SELECT id FROM public.chat_channels WHERE requires_fan_zone = true);
DELETE FROM public.channel_permissions WHERE channel_id IN (SELECT id FROM public.chat_channels WHERE requires_fan_zone = true);
DELETE FROM public.channel_welcome_embeds WHERE channel_id IN (SELECT id FROM public.chat_channels WHERE requires_fan_zone = true);
DELETE FROM public.channel_reads WHERE channel_id IN (SELECT id FROM public.chat_channels WHERE requires_fan_zone = true);
DELETE FROM public.chat_channels WHERE requires_fan_zone = true;

-- 2. Forum boards
CREATE TABLE public.forum_boards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'MessageSquare',
  sort_order integer NOT NULL DEFAULT 0,
  is_pinned boolean NOT NULL DEFAULT false,
  is_locked boolean NOT NULL DEFAULT false,
  topic_count integer NOT NULL DEFAULT 0,
  post_count integer NOT NULL DEFAULT 0,
  last_post_at timestamptz,
  last_post_by uuid,
  last_topic_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_boards TO authenticated;
GRANT ALL ON public.forum_boards TO service_role;
ALTER TABLE public.forum_boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forum_boards read members" ON public.forum_boards
  FOR SELECT TO authenticated
  USING (
    public.is_fan_zone_member(auth.uid())
    OR public.has_any_role(auth.uid(), ARRAY['admin','management','moderator']::app_role[])
  );

CREATE POLICY "forum_boards manage admin" ON public.forum_boards
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE TRIGGER trg_forum_boards_updated_at
  BEFORE UPDATE ON public.forum_boards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Board moderators
CREATE TABLE public.forum_board_moderators (
  board_id uuid NOT NULL REFERENCES public.forum_boards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.forum_board_moderators TO authenticated;
GRANT ALL ON public.forum_board_moderators TO service_role;
ALTER TABLE public.forum_board_moderators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fbm read members" ON public.forum_board_moderators
  FOR SELECT TO authenticated
  USING (
    public.is_fan_zone_member(auth.uid())
    OR public.has_any_role(auth.uid(), ARRAY['admin','management','moderator']::app_role[])
  );

CREATE POLICY "fbm manage admin" ON public.forum_board_moderators
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE OR REPLACE FUNCTION public.is_forum_moderator(_user uuid, _board uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_any_role(_user, ARRAY['admin','management','moderator']::app_role[])
    OR EXISTS (SELECT 1 FROM public.forum_board_moderators WHERE board_id = _board AND user_id = _user);
$$;

-- 4. Topics
CREATE TABLE public.forum_topics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id uuid NOT NULL REFERENCES public.forum_boards(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  title text NOT NULL,
  is_sticky boolean NOT NULL DEFAULT false,
  is_locked boolean NOT NULL DEFAULT false,
  view_count integer NOT NULL DEFAULT 0,
  reply_count integer NOT NULL DEFAULT 0,
  last_post_at timestamptz NOT NULL DEFAULT now(),
  last_post_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_forum_topics_board ON public.forum_topics(board_id, is_sticky DESC, last_post_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_topics TO authenticated;
GRANT ALL ON public.forum_topics TO service_role;
ALTER TABLE public.forum_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forum_topics read members" ON public.forum_topics
  FOR SELECT TO authenticated
  USING (
    public.is_fan_zone_member(auth.uid())
    OR public.has_any_role(auth.uid(), ARRAY['admin','management','moderator']::app_role[])
  );

CREATE POLICY "forum_topics insert members" ON public.forum_topics
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.is_fan_zone_member(auth.uid())
    AND NOT EXISTS (SELECT 1 FROM public.forum_boards b WHERE b.id = board_id AND b.is_locked)
  );

CREATE POLICY "forum_topics update mods or author title" ON public.forum_topics
  FOR UPDATE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.is_forum_moderator(auth.uid(), board_id)
  )
  WITH CHECK (
    author_id = auth.uid()
    OR public.is_forum_moderator(auth.uid(), board_id)
  );

CREATE POLICY "forum_topics delete mods" ON public.forum_topics
  FOR DELETE TO authenticated
  USING (public.is_forum_moderator(auth.uid(), board_id));

CREATE TRIGGER trg_forum_topics_updated_at
  BEFORE UPDATE ON public.forum_topics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Posts
CREATE TABLE public.forum_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id uuid NOT NULL REFERENCES public.forum_topics(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL,
  quote_of uuid REFERENCES public.forum_posts(id) ON DELETE SET NULL,
  edited_at timestamptz,
  edited_by uuid,
  is_op boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_forum_posts_topic ON public.forum_posts(topic_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_posts TO authenticated;
GRANT ALL ON public.forum_posts TO service_role;
ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forum_posts read members" ON public.forum_posts
  FOR SELECT TO authenticated
  USING (
    public.is_fan_zone_member(auth.uid())
    OR public.has_any_role(auth.uid(), ARRAY['admin','management','moderator']::app_role[])
  );

CREATE POLICY "forum_posts insert members" ON public.forum_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.is_fan_zone_member(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.forum_topics t
      JOIN public.forum_boards b ON b.id = t.board_id
      WHERE t.id = topic_id
        AND NOT b.is_locked
        AND (NOT t.is_locked OR public.is_forum_moderator(auth.uid(), t.board_id))
    )
  );

CREATE POLICY "forum_posts update own or mods" ON public.forum_posts
  FOR UPDATE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.forum_topics t WHERE t.id = topic_id AND public.is_forum_moderator(auth.uid(), t.board_id))
  )
  WITH CHECK (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.forum_topics t WHERE t.id = topic_id AND public.is_forum_moderator(auth.uid(), t.board_id))
  );

CREATE POLICY "forum_posts delete own or mods" ON public.forum_posts
  FOR DELETE TO authenticated
  USING (
    (author_id = auth.uid() AND NOT is_op)
    OR EXISTS (SELECT 1 FROM public.forum_topics t WHERE t.id = topic_id AND public.is_forum_moderator(auth.uid(), t.board_id))
  );

-- 6. Edit history
CREATE TABLE public.forum_post_edits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  edited_by uuid NOT NULL,
  previous_body text NOT NULL,
  edited_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_forum_post_edits_post ON public.forum_post_edits(post_id, edited_at DESC);

GRANT SELECT, INSERT ON public.forum_post_edits TO authenticated;
GRANT ALL ON public.forum_post_edits TO service_role;
ALTER TABLE public.forum_post_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fpe read members" ON public.forum_post_edits
  FOR SELECT TO authenticated
  USING (
    public.is_fan_zone_member(auth.uid())
    OR public.has_any_role(auth.uid(), ARRAY['admin','management','moderator']::app_role[])
  );

-- 7. Trigger: handle post insert/update/delete to maintain counters & edit history
CREATE OR REPLACE FUNCTION public.forum_post_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_board uuid;
BEGIN
  SELECT board_id INTO v_board FROM public.forum_topics WHERE id = NEW.topic_id;
  UPDATE public.forum_topics
    SET reply_count = reply_count + CASE WHEN NEW.is_op THEN 0 ELSE 1 END,
        last_post_at = NEW.created_at,
        last_post_by = NEW.author_id,
        updated_at = now()
    WHERE id = NEW.topic_id;
  UPDATE public.forum_boards
    SET post_count = post_count + 1,
        topic_count = topic_count + CASE WHEN NEW.is_op THEN 1 ELSE 0 END,
        last_post_at = NEW.created_at,
        last_post_by = NEW.author_id,
        last_topic_id = NEW.topic_id,
        updated_at = now()
    WHERE id = v_board;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_forum_post_after_insert
  AFTER INSERT ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION public.forum_post_after_insert();

CREATE OR REPLACE FUNCTION public.forum_post_before_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.body IS DISTINCT FROM OLD.body THEN
    INSERT INTO public.forum_post_edits (post_id, edited_by, previous_body)
    VALUES (OLD.id, auth.uid(), OLD.body);
    NEW.edited_at := now();
    NEW.edited_by := auth.uid();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_forum_post_before_update
  BEFORE UPDATE ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION public.forum_post_before_update();

CREATE OR REPLACE FUNCTION public.forum_post_after_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_board uuid; v_last record;
BEGIN
  SELECT board_id INTO v_board FROM public.forum_topics WHERE id = OLD.topic_id;
  IF NOT OLD.is_op THEN
    UPDATE public.forum_topics SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = OLD.topic_id;
  END IF;
  UPDATE public.forum_boards SET post_count = GREATEST(post_count - 1, 0) WHERE id = v_board;

  -- Recompute topic last post
  SELECT created_at, author_id INTO v_last
    FROM public.forum_posts WHERE topic_id = OLD.topic_id
    ORDER BY created_at DESC LIMIT 1;
  IF v_last.created_at IS NOT NULL THEN
    UPDATE public.forum_topics SET last_post_at = v_last.created_at, last_post_by = v_last.author_id WHERE id = OLD.topic_id;
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER trg_forum_post_after_delete
  AFTER DELETE ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION public.forum_post_after_delete();

-- Topic delete: fix board counts
CREATE OR REPLACE FUNCTION public.forum_topic_after_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.forum_boards
    SET topic_count = GREATEST(topic_count - 1, 0)
    WHERE id = OLD.board_id;
  RETURN OLD;
END $$;

CREATE TRIGGER trg_forum_topic_after_delete
  AFTER DELETE ON public.forum_topics
  FOR EACH ROW EXECUTE FUNCTION public.forum_topic_after_delete();

-- Increment view count RPC
CREATE OR REPLACE FUNCTION public.forum_increment_view(_topic uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_fan_zone_member(auth.uid()) OR public.has_any_role(auth.uid(), ARRAY['admin','management','moderator']::app_role[])) THEN
    RETURN;
  END IF;
  UPDATE public.forum_topics SET view_count = view_count + 1 WHERE id = _topic;
END $$;
GRANT EXECUTE ON FUNCTION public.forum_increment_view(uuid) TO authenticated;

-- 8. Seed default boards
INSERT INTO public.forum_boards (name, slug, description, icon, sort_order, is_pinned) VALUES
  ('Announcements', 'announcements', 'Official notices from the mods and staff. Up the Boro!', 'Megaphone', 0, true),
  ('General Boro Chat', 'general', 'Everything Middlesbrough F.C. — banter, opinions, the lot.', 'MessageSquare', 10, false),
  ('Match Day', 'match-day', 'Pre-match build-up, live threads and post-match reaction.', 'Goal', 20, false),
  ('Transfers & Rumours', 'transfers', 'Ins, outs, and the wildest rumours from the rumour mill.', 'ArrowLeftRight', 30, false),
  ('Tactics & Analysis', 'tactics', 'Formation talk, tactical breakdowns and stats.', 'BarChart3', 40, false),
  ('Off Topic', 'off-topic', 'Anything that isn''t Boro — keep it civil.', 'Coffee', 50, false);
