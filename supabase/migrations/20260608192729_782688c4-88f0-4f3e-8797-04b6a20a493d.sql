CREATE OR REPLACE FUNCTION public.forum_move_topic(_topic_id uuid, _new_board_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old_board_id uuid;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT board_id INTO _old_board_id FROM public.forum_topics WHERE id = _topic_id;
  IF _old_board_id IS NULL THEN
    RAISE EXCEPTION 'Topic not found';
  END IF;

  IF _old_board_id = _new_board_id THEN
    RETURN;
  END IF;

  -- Caller must be admin/management or a moderator on the source board
  IF NOT (
    public.has_any_role(_uid, ARRAY['admin'::app_role, 'management'::app_role])
    OR public.is_forum_moderator(_uid, _old_board_id)
  ) THEN
    RAISE EXCEPTION 'Not allowed to move this topic';
  END IF;

  -- Destination board must exist and not be locked
  IF NOT EXISTS (SELECT 1 FROM public.forum_boards WHERE id = _new_board_id AND NOT is_locked) THEN
    RAISE EXCEPTION 'Destination board unavailable';
  END IF;

  UPDATE public.forum_topics SET board_id = _new_board_id WHERE id = _topic_id;

  -- Resync counts on both boards
  UPDATE public.forum_boards b SET
    topic_count = COALESCE((SELECT count(*) FROM public.forum_topics t WHERE t.board_id = b.id), 0),
    post_count = COALESCE((SELECT count(*) FROM public.forum_posts p JOIN public.forum_topics t ON t.id = p.topic_id WHERE t.board_id = b.id), 0)
  WHERE b.id IN (_old_board_id, _new_board_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.forum_move_topic(uuid, uuid) TO authenticated;