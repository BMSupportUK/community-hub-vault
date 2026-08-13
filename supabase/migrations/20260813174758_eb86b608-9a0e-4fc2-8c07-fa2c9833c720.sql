ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS forum_posts_pinned_idx ON public.forum_posts (topic_id) WHERE is_pinned;