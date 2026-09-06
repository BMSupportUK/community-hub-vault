CREATE OR REPLACE FUNCTION public.submit_content_report(_kind text, _target uuid, _reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_reason text := btrim(COALESCE(_reason,''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _kind NOT IN ('forum_post','dm_message') THEN RAISE EXCEPTION 'Invalid kind'; END IF;
  IF _target IS NULL THEN RAISE EXCEPTION 'Missing target'; END IF;
  IF char_length(v_reason) < 3 THEN RAISE EXCEPTION 'Please provide a reason (min 3 chars)'; END IF;
  IF char_length(v_reason) > 1000 THEN v_reason := left(v_reason, 1000); END IF;

  IF _kind = 'forum_post' THEN
    IF NOT EXISTS (SELECT 1 FROM public.forum_posts WHERE id = _target) THEN
      RAISE EXCEPTION 'Post not found';
    END IF;
  ELSIF _kind = 'dm_message' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.fan_zone_dm_messages m
      JOIN public.fan_zone_dm_threads t ON t.id = m.thread_id
      WHERE m.id = _target AND v_uid IN (t.user_low, t.user_high)
    ) THEN RAISE EXCEPTION 'Message not found'; END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.content_reports
    WHERE reporter_id = v_uid AND kind = _kind AND target_id = _target AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'You have already reported this';
  END IF;

  INSERT INTO public.content_reports (kind, target_id, reporter_id, reason)
  VALUES (_kind, _target, v_uid, v_reason)
  RETURNING id INTO v_id;

  -- Fan Zone reports stay inside the Fan Zone moderation centre; no BM Support
  -- staff notification is created.
  RETURN v_id;
END;
$$;

DELETE FROM public.staff_notifications WHERE kind = 'content_report';