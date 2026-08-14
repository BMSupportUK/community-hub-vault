-- Recompute board-level latest post info after a post is deleted
CREATE OR REPLACE FUNCTION public.forum_post_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_board uuid; v_last record; v_bl record;
BEGIN
  SELECT board_id INTO v_board FROM public.forum_topics WHERE id = OLD.topic_id;
  IF NOT OLD.is_op THEN
    UPDATE public.forum_topics SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = OLD.topic_id;
  END IF;
  UPDATE public.forum_boards SET post_count = GREATEST(post_count - 1, 0) WHERE id = v_board;

  -- Recompute topic last post
  SELECT created_at, author_id INTO v_last
    FROM public.forum_posts WHERE topic_id = OLD.topic_id
    ORDER BY created_at DESC LIMIT 1;
  IF v_last.created_at IS NOT NULL THEN
    UPDATE public.forum_topics SET last_post_at = v_last.created_at, last_post_by = v_last.author_id WHERE id = OLD.topic_id;
  END IF;

  -- Recompute board last post (author/time/topic) from remaining posts
  IF v_board IS NOT NULL THEN
    SELECT p.created_at, p.author_id, p.topic_id INTO v_bl
      FROM public.forum_posts p
      JOIN public.forum_topics t ON t.id = p.topic_id
      WHERE t.board_id = v_board
      ORDER BY p.created_at DESC LIMIT 1;
    UPDATE public.forum_boards
      SET last_post_at = v_bl.created_at,
          last_post_by = v_bl.author_id,
          last_topic_id = v_bl.topic_id,
          updated_at = now()
      WHERE id = v_board;
  END IF;
  RETURN OLD;
END $function$;

-- Recompute board-level latest post info after a topic is deleted
CREATE OR REPLACE FUNCTION public.forum_topic_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_bl record;
BEGIN
  UPDATE public.forum_boards
    SET topic_count = GREATEST(topic_count - 1, 0)
    WHERE id = OLD.board_id;

  SELECT p.created_at, p.author_id, p.topic_id INTO v_bl
    FROM public.forum_posts p
    JOIN public.forum_topics t ON t.id = p.topic_id
    WHERE t.board_id = OLD.board_id
    ORDER BY p.created_at DESC LIMIT 1;

  UPDATE public.forum_boards
    SET last_post_at = v_bl.created_at,
        last_post_by = v_bl.author_id,
        last_topic_id = v_bl.topic_id,
        updated_at = now()
    WHERE id = OLD.board_id;
  RETURN OLD;
END $function$;

-- One-off repair of existing boards
UPDATE public.forum_boards b
SET last_post_at = x.created_at,
    last_post_by = x.author_id,
    last_topic_id = x.topic_id
FROM (
  SELECT DISTINCT ON (t.board_id) t.board_id, p.created_at, p.author_id, p.topic_id
  FROM public.forum_posts p
  JOIN public.forum_topics t ON t.id = p.topic_id
  ORDER BY t.board_id, p.created_at DESC
) x
WHERE x.board_id = b.id
  AND (b.last_post_by IS DISTINCT FROM x.author_id
    OR b.last_post_at IS DISTINCT FROM x.created_at
    OR b.last_topic_id IS DISTINCT FROM x.topic_id);

UPDATE public.forum_boards b
SET last_post_at = NULL, last_post_by = NULL, last_topic_id = NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.forum_topics t
  JOIN public.forum_posts p ON p.topic_id = t.id
  WHERE t.board_id = b.id
) AND (b.last_post_by IS NOT NULL OR b.last_post_at IS NOT NULL);