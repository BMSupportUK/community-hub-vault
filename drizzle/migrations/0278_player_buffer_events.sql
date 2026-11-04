CREATE TABLE public.player_buffer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL,
  user_id uuid,
  platform text,
  app_version text,
  kind text NOT NULL DEFAULT 'live',
  content_id text NOT NULL DEFAULT '',
  content_name text NOT NULL DEFAULT '',
  stall_ms integer NOT NULL DEFAULT 0,
  reconnected boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX player_buffer_events_occurred_idx ON public.player_buffer_events (occurred_at DESC);
CREATE INDEX player_buffer_events_content_idx ON public.player_buffer_events (kind, content_name, occurred_at DESC);
GRANT SELECT ON public.player_buffer_events TO authenticated;
GRANT ALL ON public.player_buffer_events TO service_role;
ALTER TABLE public.player_buffer_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin and management read buffering"
  ON public.player_buffer_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));

CREATE OR REPLACE FUNCTION public.player_buffer_summary(_hours integer)
RETURNS TABLE (kind text, content_name text, stalls bigint, devices bigint, reconnects bigint, total_stall_seconds bigint, last_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.kind, e.content_name, count(*), count(DISTINCT e.device_id),
         count(*) FILTER (WHERE e.reconnected), (sum(e.stall_ms) / 1000)::bigint, max(e.occurred_at)
  FROM public.player_buffer_events e
  WHERE (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'))
    AND e.occurred_at >= now() - make_interval(hours => greatest(1, least(_hours, 720)))
  GROUP BY e.kind, e.content_name
  ORDER BY count(DISTINCT e.device_id) DESC, count(*) DESC
  LIMIT 100
$$;
REVOKE ALL ON FUNCTION public.player_buffer_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_buffer_summary(integer) TO authenticated;