UPDATE public.forum_boards b
SET
  topic_count = COALESCE((SELECT COUNT(*)::int FROM public.forum_topics t WHERE t.board_id = b.id), 0),
  post_count  = COALESCE((SELECT COUNT(*)::int FROM public.forum_posts fp JOIN public.forum_topics ft ON ft.id = fp.topic_id WHERE ft.board_id = b.id), 0);