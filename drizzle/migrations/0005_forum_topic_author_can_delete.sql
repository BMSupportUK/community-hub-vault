DROP POLICY IF EXISTS "forum_topics delete mods" ON public.forum_topics;
CREATE POLICY "forum_topics delete mods or author"
ON public.forum_topics
FOR DELETE
TO authenticated
USING (author_id = auth.uid() OR public.is_forum_moderator(auth.uid(), board_id));