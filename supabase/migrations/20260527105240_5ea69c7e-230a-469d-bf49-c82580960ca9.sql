
DROP POLICY IF EXISTS "forum_topics insert members" ON public.forum_topics;
CREATE POLICY "forum_topics insert members" ON public.forum_topics
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      is_fan_zone_member(auth.uid())
      OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role, 'moderator'::app_role])
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.forum_boards b
      WHERE b.id = forum_topics.board_id AND b.is_locked
    )
  );

DROP POLICY IF EXISTS "forum_posts insert members" ON public.forum_posts;
CREATE POLICY "forum_posts insert members" ON public.forum_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      is_fan_zone_member(auth.uid())
      OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role, 'moderator'::app_role])
    )
    AND EXISTS (
      SELECT 1 FROM public.forum_topics t
      JOIN public.forum_boards b ON b.id = t.board_id
      WHERE t.id = forum_posts.topic_id
        AND NOT b.is_locked
        AND (NOT t.is_locked OR is_forum_moderator(auth.uid(), t.board_id))
    )
  );
