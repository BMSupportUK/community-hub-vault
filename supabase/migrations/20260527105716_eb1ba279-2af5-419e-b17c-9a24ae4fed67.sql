
CREATE TABLE public.forum_post_reactions (
  post_id UUID NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id, emoji)
);

CREATE INDEX idx_forum_post_reactions_post ON public.forum_post_reactions(post_id);

GRANT SELECT, INSERT, DELETE ON public.forum_post_reactions TO authenticated;
GRANT ALL ON public.forum_post_reactions TO service_role;

ALTER TABLE public.forum_post_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reactions read members" ON public.forum_post_reactions
  FOR SELECT TO authenticated
  USING (
    is_fan_zone_member(auth.uid())
    OR has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role])
  );

CREATE POLICY "reactions insert own" ON public.forum_post_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND char_length(emoji) BETWEEN 1 AND 16
    AND (
      is_fan_zone_member(auth.uid())
      OR has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role])
    )
  );

CREATE POLICY "reactions delete own" ON public.forum_post_reactions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.forum_post_reactions;
