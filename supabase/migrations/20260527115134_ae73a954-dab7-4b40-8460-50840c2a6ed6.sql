DROP POLICY IF EXISTS "forum_posts read members" ON public.forum_posts;
CREATE POLICY "forum_posts read members" ON public.forum_posts
FOR SELECT
USING (is_fan_zone_member(auth.uid()) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role, 'staff'::app_role, 'moderator'::app_role]));

DROP POLICY IF EXISTS "forum_topics read members" ON public.forum_topics;
CREATE POLICY "forum_topics read members" ON public.forum_topics
FOR SELECT
USING (is_fan_zone_member(auth.uid()) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role, 'staff'::app_role, 'moderator'::app_role]));