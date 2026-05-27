
ALTER PUBLICATION supabase_realtime ADD TABLE public.forum_topics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.forum_posts;
ALTER TABLE public.forum_topics REPLICA IDENTITY FULL;
ALTER TABLE public.forum_posts REPLICA IDENTITY FULL;
