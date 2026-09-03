CREATE TABLE IF NOT EXISTS public.forum_topic_reads (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.forum_topics(id) ON DELETE CASCADE,
  last_post_id uuid,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, topic_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_topic_reads TO authenticated;
GRANT ALL ON public.forum_topic_reads TO service_role;

ALTER TABLE public.forum_topic_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own forum read markers"
ON public.forum_topic_reads FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);