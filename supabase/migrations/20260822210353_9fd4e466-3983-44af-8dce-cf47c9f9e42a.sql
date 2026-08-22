ALTER TABLE public.forum_polls REPLICA IDENTITY FULL;
ALTER TABLE public.forum_poll_options REPLICA IDENTITY FULL;
ALTER TABLE public.forum_poll_votes REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.forum_polls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.forum_poll_options;
ALTER PUBLICATION supabase_realtime ADD TABLE public.forum_poll_votes;