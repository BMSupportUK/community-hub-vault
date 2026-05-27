DROP POLICY IF EXISTS "forum_posts read members" ON public.forum_posts;
CREATE POLICY "forum_posts read members" ON public.forum_posts
FOR SELECT
USING (
  is_fan_zone_member(auth.uid())
  OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role, 'staff'::app_role, 'moderator'::app_role])
);

DROP POLICY IF EXISTS "forum_topics read members" ON public.forum_topics;
CREATE POLICY "forum_topics read members" ON public.forum_topics
FOR SELECT
USING (
  is_fan_zone_member(auth.uid())
  OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role, 'staff'::app_role, 'moderator'::app_role])
);

DROP POLICY IF EXISTS "forum_posts insert members" ON public.forum_posts;
CREATE POLICY "forum_posts insert members" ON public.forum_posts
FOR INSERT
WITH CHECK (
  author_id = auth.uid()
  AND (
    is_fan_zone_member(auth.uid())
    OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role, 'staff'::app_role, 'moderator'::app_role])
  )
  AND EXISTS (
    SELECT 1 FROM forum_topics t
    JOIN forum_boards b ON b.id = t.board_id
    WHERE t.id = forum_posts.topic_id
      AND NOT b.is_locked
      AND (NOT t.is_locked OR is_forum_moderator(auth.uid(), t.board_id))
  )
);