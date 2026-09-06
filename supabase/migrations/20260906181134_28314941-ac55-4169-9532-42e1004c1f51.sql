CREATE TABLE IF NOT EXISTS public.fan_zone_dm_thread_clears (
  thread_id uuid NOT NULL REFERENCES public.fan_zone_dm_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cleared_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fan_zone_dm_thread_clears TO authenticated;
GRANT ALL ON public.fan_zone_dm_thread_clears TO service_role;
ALTER TABLE public.fan_zone_dm_thread_clears ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own dm clears" ON public.fan_zone_dm_thread_clears;
CREATE POLICY "own dm clears" ON public.fan_zone_dm_thread_clears
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.clear_fan_dm_threads(_threads uuid[])
RETURNS integer
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_me uuid := auth.uid(); v_count integer := 0;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.fan_zone_dm_thread_clears (thread_id, user_id, cleared_at)
  SELECT t.id, v_me, now()
  FROM public.fan_zone_dm_threads t
  WHERE t.id = ANY(_threads) AND v_me IN (t.user_low, t.user_high)
  ON CONFLICT (thread_id, user_id) DO UPDATE SET cleared_at = now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.clear_fan_dm_threads(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.clear_fan_dm_threads(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_my_fan_dm_threads()
 RETURNS TABLE(thread_id uuid, other_user_id uuid, other_alias text, other_avatar text, last_message_at timestamp with time zone, last_body text, last_sender_id uuid, unread boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN QUERY
  WITH ts AS (
    SELECT t.id,
           CASE WHEN t.user_low = v_me THEN t.user_high ELSE t.user_low END AS other,
           t.last_message_at,
           CASE WHEN t.user_low = v_me THEN t.last_read_low ELSE t.last_read_high END AS my_read,
           c.cleared_at
    FROM public.fan_zone_dm_threads t
    LEFT JOIN public.fan_zone_dm_thread_clears c ON c.thread_id = t.id AND c.user_id = v_me
    WHERE v_me IN (t.user_low, t.user_high)
      AND (c.cleared_at IS NULL OR (t.last_message_at IS NOT NULL AND t.last_message_at > c.cleared_at))
  ),
  last_msg AS (
    SELECT DISTINCT ON (m.thread_id) m.thread_id, m.body, m.sender_id, m.created_at
    FROM public.fan_zone_dm_messages m
    WHERE m.thread_id IN (SELECT id FROM ts)
    ORDER BY m.thread_id, m.created_at DESC
  )
  SELECT
    ts.id,
    ts.other,
    COALESCE(NULLIF(fzm.fan_alias,''),'Boro Fan'),
    COALESCE(NULLIF(fzm.fan_avatar_url,''), public.fan_zone_default_avatar_url()),
    ts.last_message_at,
    lm.body,
    lm.sender_id,
    (ts.last_message_at IS NOT NULL
      AND (ts.my_read IS NULL OR ts.my_read < ts.last_message_at)
      AND COALESCE(lm.sender_id, ts.other) <> v_me)
  FROM ts
  LEFT JOIN public.fan_zone_members fzm ON fzm.user_id = ts.other
  LEFT JOIN last_msg lm ON lm.thread_id = ts.id
  ORDER BY ts.last_message_at DESC NULLS LAST;
END;
$function$;