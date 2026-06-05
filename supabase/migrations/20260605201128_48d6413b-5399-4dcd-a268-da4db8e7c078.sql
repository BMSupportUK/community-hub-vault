
CREATE TABLE public.forum_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL UNIQUE REFERENCES public.forum_topics(id) ON DELETE CASCADE,
  question text NOT NULL,
  allow_multiple boolean NOT NULL DEFAULT false,
  closes_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_polls TO authenticated;
GRANT ALL ON public.forum_polls TO service_role;
ALTER TABLE public.forum_polls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "polls read members" ON public.forum_polls FOR SELECT TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin','management','moderator','staff']::app_role[])
  OR EXISTS (SELECT 1 FROM public.forum_topics t WHERE t.id = topic_id
             AND forum_board_allows(auth.uid(), t.board_id, 'view'))
);
CREATE POLICY "polls insert author or mod" ON public.forum_polls FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (SELECT 1 FROM public.forum_topics t WHERE t.id = topic_id
              AND (t.author_id = auth.uid() OR is_forum_moderator(auth.uid(), t.board_id)))
);
CREATE POLICY "polls update mod" ON public.forum_polls FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.forum_topics t WHERE t.id = topic_id
               AND (t.author_id = auth.uid() OR is_forum_moderator(auth.uid(), t.board_id))));
CREATE POLICY "polls delete mod" ON public.forum_polls FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.forum_topics t WHERE t.id = topic_id
               AND (t.author_id = auth.uid() OR is_forum_moderator(auth.uid(), t.board_id))));

CREATE TRIGGER trg_forum_polls_updated_at BEFORE UPDATE ON public.forum_polls
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.forum_poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.forum_polls(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_forum_poll_options_poll ON public.forum_poll_options(poll_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_poll_options TO authenticated;
GRANT ALL ON public.forum_poll_options TO service_role;
ALTER TABLE public.forum_poll_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "poll_options read members" ON public.forum_poll_options FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.forum_polls p WHERE p.id = poll_id));
CREATE POLICY "poll_options insert author or mod" ON public.forum_poll_options FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.forum_polls p
  JOIN public.forum_topics t ON t.id = p.topic_id
  WHERE p.id = poll_id
    AND (t.author_id = auth.uid() OR is_forum_moderator(auth.uid(), t.board_id))
));
CREATE POLICY "poll_options delete author or mod" ON public.forum_poll_options FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.forum_polls p
  JOIN public.forum_topics t ON t.id = p.topic_id
  WHERE p.id = poll_id
    AND (t.author_id = auth.uid() OR is_forum_moderator(auth.uid(), t.board_id))
));

CREATE TABLE public.forum_poll_votes (
  poll_id uuid NOT NULL REFERENCES public.forum_polls(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.forum_poll_options(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, option_id, user_id)
);
CREATE INDEX idx_forum_poll_votes_poll ON public.forum_poll_votes(poll_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_poll_votes TO authenticated;
GRANT ALL ON public.forum_poll_votes TO service_role;
ALTER TABLE public.forum_poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "poll_votes read members" ON public.forum_poll_votes FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.forum_polls p WHERE p.id = poll_id));
CREATE POLICY "poll_votes insert self" ON public.forum_poll_votes FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.forum_polls p
    JOIN public.forum_topics t ON t.id = p.topic_id
    WHERE p.id = poll_id
      AND (p.closes_at IS NULL OR p.closes_at > now())
      AND (
        has_any_role(auth.uid(), ARRAY['admin','management','moderator','staff']::app_role[])
        OR forum_board_allows(auth.uid(), t.board_id, 'view')
      )
  )
);
CREATE POLICY "poll_votes delete self or admin" ON public.forum_poll_votes FOR DELETE TO authenticated
USING (user_id = auth.uid() OR has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));
