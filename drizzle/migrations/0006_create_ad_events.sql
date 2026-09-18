CREATE TABLE public.ad_events (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('impression','click')),
  slot_key TEXT NOT NULL,
  ad_slot_id TEXT NOT NULL,
  page_path TEXT NOT NULL DEFAULT '',
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT INSERT ON public.ad_events TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.ad_events_id_seq TO anon, authenticated;
GRANT ALL ON public.ad_events TO service_role;
GRANT ALL ON SEQUENCE public.ad_events_id_seq TO service_role;

ALTER TABLE public.ad_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can record ad events"
  ON public.ad_events FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "staff can read ad events"
  ON public.ad_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));

CREATE INDEX ad_events_created_at_idx ON public.ad_events (created_at DESC);
CREATE INDEX ad_events_slot_idx ON public.ad_events (ad_slot_id, kind);

CREATE OR REPLACE FUNCTION public.ad_event_stats(_days INT DEFAULT 30)
RETURNS TABLE (
  day DATE,
  slot_key TEXT,
  ad_slot_id TEXT,
  page_path TEXT,
  impressions BIGINT,
  clicks BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management')) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  RETURN QUERY
  SELECT (e.created_at AT TIME ZONE 'Europe/London')::date AS day,
         e.slot_key,
         e.ad_slot_id,
         e.page_path,
         count(*) FILTER (WHERE e.kind = 'impression') AS impressions,
         count(*) FILTER (WHERE e.kind = 'click') AS clicks
  FROM public.ad_events e
  WHERE e.created_at >= now() - make_interval(days => greatest(coalesce(_days, 30), 1))
  GROUP BY 1, 2, 3, 4
  ORDER BY 1 DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.ad_event_stats(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ad_event_stats(INT) TO authenticated;
