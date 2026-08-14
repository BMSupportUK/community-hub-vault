CREATE OR REPLACE FUNCTION public.process_forum_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topic RECORD;
  v_slug text;
  v_author text;
  v_link text;
  v_snippet text;
  v_ids uuid[] := '{}';
  v_specials text[] := '{}';
  m text[];
BEGIN
  SELECT t.id, t.title, t.board_id INTO v_topic FROM public.forum_topics t WHERE t.id = NEW.topic_id;
  IF v_topic.id IS NULL THEN RETURN NEW; END IF;
  SELECT b.slug INTO v_slug FROM public.forum_boards b WHERE b.id = v_topic.board_id;
  IF v_slug IS NULL THEN RETURN NEW; END IF;
  v_link := '/forum/' || v_slug || '/' || v_topic.id::text;

  SELECT COALESCE(NULLIF(TRIM(fzm.fan_alias), ''), 'A member')
    INTO v_author
    FROM public.fan_zone_members fzm WHERE fzm.user_id = NEW.author_id;
  IF v_author IS NULL THEN v_author := 'A member'; END IF;

  v_snippet := LEFT(REGEXP_REPLACE(NEW.body, '<[^>]*>', ' ', 'g'), 160);

  FOR m IN SELECT regexp_matches(NEW.body, 'data-mention-id="([0-9a-fA-F-]{36})"', 'g') LOOP
    v_ids := v_ids || m[1]::uuid;
  END LOOP;
  FOR m IN SELECT regexp_matches(NEW.body, 'data-mention-key="([a-zA-Z]+)"', 'g') LOOP
    v_specials := v_specials || LOWER(m[1]);
  END LOOP;

  IF array_length(v_specials, 1) IS NOT NULL THEN
    IF v_specials && ARRAY['members','all','everyone'] THEN
      SELECT v_ids || COALESCE(array_agg(fzm.user_id), '{}') INTO v_ids
      FROM public.fan_zone_members fzm WHERE fzm.status = 'approved';
    END IF;
    SELECT v_ids || COALESCE(array_agg(ur.user_id), '{}') INTO v_ids
    FROM public.user_roles ur
    WHERE ur.role::text = ANY (v_specials);
  END IF;

  IF array_length(v_ids, 1) IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.user_notifications (user_id, kind, title, body, link_path, source_type, source_id)
  SELECT DISTINCT u, 'mention',
         v_author || ' mentioned you in "' || COALESCE(v_topic.title, 'a topic') || '"',
         v_snippet, v_link, 'forum_post', NEW.id
  FROM unnest(v_ids) AS u
  WHERE u <> NEW.author_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_forum_post_mentions ON public.forum_posts;
CREATE TRIGGER trg_forum_post_mentions
AFTER INSERT ON public.forum_posts
FOR EACH ROW EXECUTE FUNCTION public.process_forum_mentions();