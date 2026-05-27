-- Per-board, per-role permissions
CREATE TABLE IF NOT EXISTS public.forum_board_permissions (
  board_id uuid NOT NULL REFERENCES public.forum_boards(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_create_topic boolean NOT NULL DEFAULT false,
  can_reply boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, role)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_board_permissions TO authenticated;
GRANT ALL ON public.forum_board_permissions TO service_role;

ALTER TABLE public.forum_board_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fbp read members" ON public.forum_board_permissions
FOR SELECT TO authenticated
USING (
  is_fan_zone_member(auth.uid())
  OR has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'staff'::app_role,'moderator'::app_role])
);

CREATE POLICY "fbp manage admin" ON public.forum_board_permissions
FOR ALL TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]))
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]));

CREATE TRIGGER trg_fbp_updated_at
BEFORE UPDATE ON public.forum_board_permissions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper: does _user have _action on _board?
-- _action in ('view','create_topic','reply')
CREATE OR REPLACE FUNCTION public.forum_board_allows(_user uuid, _board uuid, _action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_has_config boolean;
BEGIN
  -- Global staff/admin/moderator always allowed
  IF public.has_any_role(_user, ARRAY['admin','management','moderator']::app_role[]) THEN
    RETURN true;
  END IF;
  -- Board-specific moderator always allowed
  IF EXISTS (SELECT 1 FROM public.forum_board_moderators
             WHERE board_id = _board AND user_id = _user) THEN
    RETURN true;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.forum_board_permissions WHERE board_id = _board)
    INTO v_has_config;

  IF v_has_config THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.forum_board_permissions p
      JOIN public.user_roles ur ON ur.role = p.role
      WHERE p.board_id = _board
        AND ur.user_id = _user
        AND CASE _action
              WHEN 'view'         THEN p.can_view
              WHEN 'create_topic' THEN p.can_create_topic
              WHEN 'reply'        THEN p.can_reply
              ELSE false
            END
    );
  END IF;

  -- Fallback (no config rows): approved fan zone members OR staff role
  RETURN public.is_fan_zone_member(_user)
      OR public.has_any_role(_user, ARRAY['staff']::app_role[]);
END $$;

GRANT EXECUTE ON FUNCTION public.forum_board_allows(uuid, uuid, text) TO authenticated;

-- Rewire RLS policies to use forum_board_allows
DROP POLICY IF EXISTS "forum_boards read members" ON public.forum_boards;
CREATE POLICY "forum_boards read members" ON public.forum_boards
FOR SELECT TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role,'staff'::app_role])
  OR public.forum_board_allows(auth.uid(), id, 'view')
);

DROP POLICY IF EXISTS "forum_topics read members" ON public.forum_topics;
CREATE POLICY "forum_topics read members" ON public.forum_topics
FOR SELECT TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role,'staff'::app_role])
  OR public.forum_board_allows(auth.uid(), board_id, 'view')
);

DROP POLICY IF EXISTS "forum_topics insert members" ON public.forum_topics;
CREATE POLICY "forum_topics insert members" ON public.forum_topics
FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND public.forum_board_allows(auth.uid(), board_id, 'create_topic')
  AND EXISTS (
    SELECT 1 FROM public.forum_boards b
    WHERE b.id = forum_topics.board_id AND NOT b.is_locked
  )
);

DROP POLICY IF EXISTS "forum_posts read members" ON public.forum_posts;
CREATE POLICY "forum_posts read members" ON public.forum_posts
FOR SELECT TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role,'staff'::app_role])
  OR EXISTS (
    SELECT 1 FROM public.forum_topics t
    WHERE t.id = forum_posts.topic_id
      AND public.forum_board_allows(auth.uid(), t.board_id, 'view')
  )
);

DROP POLICY IF EXISTS "forum_posts insert members" ON public.forum_posts;
CREATE POLICY "forum_posts insert members" ON public.forum_posts
FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.forum_topics t
    JOIN public.forum_boards b ON b.id = t.board_id
    WHERE t.id = forum_posts.topic_id
      AND NOT b.is_locked
      AND (NOT t.is_locked OR is_forum_moderator(auth.uid(), t.board_id))
      AND public.forum_board_allows(auth.uid(), t.board_id, 'reply')
  )
);