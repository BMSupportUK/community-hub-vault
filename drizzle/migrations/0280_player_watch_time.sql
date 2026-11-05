CREATE TABLE public.player_watch_daily (
  day date NOT NULL,
  device_id uuid NOT NULL,
  kind text NOT NULL,
  seconds bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (day, device_id, kind)
);
GRANT ALL ON public.player_watch_daily TO service_role;
ALTER TABLE public.player_watch_daily ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.add_player_watch_seconds(_device uuid, _kind text, _seconds integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.player_watch_daily (day, device_id, kind, seconds)
  VALUES ((now() AT TIME ZONE 'Europe/London')::date, _device, left(_kind, 20), greatest(0, least(_seconds, 180)))
  ON CONFLICT (day, device_id, kind) DO UPDATE SET seconds = player_watch_daily.seconds + excluded.seconds
$$;
REVOKE ALL ON FUNCTION public.add_player_watch_seconds(uuid, text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_player_watch_seconds(uuid, text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.player_watch_weekly(_weeks integer)
RETURNS TABLE(week_start date, kind text, hours numeric, devices bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT date_trunc('week', w.day)::date, w.kind, round(sum(w.seconds) / 3600.0, 1), count(DISTINCT w.device_id)
  FROM public.player_watch_daily w
  WHERE (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'))
    AND w.day >= (date_trunc('week', now() AT TIME ZONE 'Europe/London') - make_interval(weeks => greatest(1, least(_weeks, 52)) - 1))::date
  GROUP BY 1, 2 ORDER BY 1 DESC, 2
$$;
REVOKE ALL ON FUNCTION public.player_watch_weekly(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.player_watch_weekly(integer) TO authenticated;