
CREATE TABLE public.content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('forum_post','dm_message')),
  target_id uuid NOT NULL,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','dismissed')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX content_reports_status_idx ON public.content_reports (status, created_at DESC);
CREATE INDEX content_reports_target_idx ON public.content_reports (kind, target_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_reports TO authenticated;
GRANT ALL ON public.content_reports TO service_role;

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reporters insert own"
  ON public.content_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Staff view all"
  ON public.content_reports FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','boro_fan_zone_moderator']::app_role[]));

CREATE POLICY "Staff update"
  ON public.content_reports FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','boro_fan_zone_moderator']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','boro_fan_zone_moderator']::app_role[]));

CREATE TRIGGER content_reports_set_updated_at
  BEFORE UPDATE ON public.content_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
  v_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _kind NOT IN ('forum_post','dm_message') THEN RAISE EXCEPTION 'Invalid kind'; END IF;
  IF _target IS NULL THEN RAISE EXCEPTION 'Missing target'; END IF;
  IF char_length(v_reason) < 3 THEN RAISE EXCEPTION 'Please provide a reason (min 3 chars)'; END IF;
  IF char_length(v_reason) > 1000 THEN v_reason := left(v_reason, 1000); END IF;

  -- Validate caller can see the target (avoids spam reports of nonexistent things)
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

  -- Prevent duplicate open reports from same user
  IF EXISTS (
    SELECT 1 FROM public.content_reports
    WHERE reporter_id = v_uid AND kind = _kind AND target_id = _target AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'You have already reported this';
  END IF;

  INSERT INTO public.content_reports (kind, target_id, reporter_id, reason)
  VALUES (_kind, _target, v_uid, v_reason)
  RETURNING id INTO v_id;

  SELECT COALESCE(display_name, username, 'A user') INTO v_name FROM public.profiles WHERE id = v_uid;
  INSERT INTO public.staff_notifications (kind, title, body, link_path, entity_id)
  VALUES (
    'content_report',
    'New content report (' || _kind || ')',
    COALESCE(v_name,'Someone') || ' reported a ' || replace(_kind,'_',' ') || ': ' || left(v_reason, 160),
    '/admin/reports',
    v_id
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_content_report(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_content_report(text, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_content_reports(_status text DEFAULT 'pending')
RETURNS TABLE (
  id uuid,
  kind text,
  target_id uuid,
  reporter_id uuid,
  reporter_name text,
  reason text,
  status text,
  created_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  target_preview text,
  target_author_id uuid,
  target_author_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','boro_fan_zone_moderator']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT
    r.id, r.kind, r.target_id, r.reporter_id,
    COALESCE(NULLIF(rp.display_name,''), NULLIF(rp.username,''), 'User') AS reporter_name,
    r.reason, r.status, r.created_at, r.reviewed_by, r.reviewed_at, r.notes,
    CASE r.kind
      WHEN 'forum_post' THEN (SELECT left(regexp_replace(fp.body, '<[^>]+>', '', 'g'), 280) FROM public.forum_posts fp WHERE fp.id = r.target_id)
      WHEN 'dm_message' THEN (SELECT left(m.body, 280) FROM public.fan_zone_dm_messages m WHERE m.id = r.target_id)
    END AS target_preview,
    CASE r.kind
      WHEN 'forum_post' THEN (SELECT fp.author_id FROM public.forum_posts fp WHERE fp.id = r.target_id)
      WHEN 'dm_message' THEN (SELECT m.sender_id FROM public.fan_zone_dm_messages m WHERE m.id = r.target_id)
    END AS target_author_id,
    CASE r.kind
      WHEN 'forum_post' THEN (SELECT COALESCE(NULLIF(ap.display_name,''), NULLIF(ap.username,''), 'User') FROM public.forum_posts fp JOIN public.profiles ap ON ap.id = fp.author_id WHERE fp.id = r.target_id)
      WHEN 'dm_message' THEN (SELECT COALESCE(NULLIF(ap.display_name,''), NULLIF(ap.username,''), 'User') FROM public.fan_zone_dm_messages m JOIN public.profiles ap ON ap.id = m.sender_id WHERE m.id = r.target_id)
    END AS target_author_name
  FROM public.content_reports r
  LEFT JOIN public.profiles rp ON rp.id = r.reporter_id
  WHERE (_status IS NULL OR r.status = _status)
  ORDER BY r.created_at DESC
  LIMIT 500;
END;
$$;

REVOKE ALL ON FUNCTION public.list_content_reports(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_content_reports(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_content_report(_id uuid, _status text, _notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','boro_fan_zone_moderator']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _status NOT IN ('pending','reviewed','dismissed') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE public.content_reports
    SET status = _status,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        notes = COALESCE(_notes, notes)
    WHERE id = _id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_content_report(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_content_report(uuid, text, text) TO authenticated;
