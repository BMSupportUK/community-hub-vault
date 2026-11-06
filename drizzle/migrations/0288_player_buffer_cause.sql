ALTER TABLE public.player_buffer_events ADD COLUMN IF NOT EXISTS cause text CHECK (cause IN ('provider_cut','advert_switch','network_drop'));
UPDATE public.player_buffer_events SET cause = CASE WHEN is_freeze AND stall_ms = 0 THEN 'provider_cut' ELSE 'network_drop' END WHERE cause IS NULL;
DROP FUNCTION IF EXISTS public.player_buffer_summary(integer);
DROP FUNCTION IF EXISTS public.player_buffer_summary(date, date);
CREATE FUNCTION public.player_buffer_summary(_hours integer)
RETURNS TABLE (kind text, content_name text, stalls bigint, devices bigint, reconnects bigint, total_stall_seconds bigint, last_at timestamptz, provider_cuts bigint, advert_switches bigint, network_drops bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.kind, e.content_name, count(*), count(DISTINCT e.device_id),
         count(*) FILTER (WHERE e.reconnected), (sum(e.stall_ms) / 1000)::bigint, max(e.occurred_at),
         count(*) FILTER (WHERE e.cause = 'provider_cut'), count(*) FILTER (WHERE e.cause = 'advert_switch'), count(*) FILTER (WHERE coalesce(e.cause,'network_drop') = 'network_drop')
  FROM public.player_buffer_events e
  WHERE (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'))
    AND e.occurred_at >= now() - make_interval(hours => greatest(1, least(_hours, 720)))
  GROUP BY e.kind, e.content_name
  ORDER BY count(DISTINCT e.device_id) DESC, count(*) DESC
  LIMIT 100
$$;
REVOKE ALL ON FUNCTION public.player_buffer_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_buffer_summary(integer) TO authenticated;
CREATE FUNCTION public.player_buffer_summary(_from date, _to date)
RETURNS TABLE(kind text, content_name text, stalls bigint, devices bigint, reconnects bigint, total_stall_seconds bigint, last_at timestamptz, provider_cuts bigint, advert_switches bigint, network_drops bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
 IF NOT coalesce(public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]), false) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 IF _from IS NULL OR _to IS NULL OR _to <= _from THEN RAISE EXCEPTION 'Invalid date range'; END IF;
 RETURN QUERY SELECT e.kind, e.content_name, count(*), count(DISTINCT e.device_id), count(*) FILTER (WHERE e.reconnected), (sum(e.stall_ms) / 1000)::bigint, max(e.occurred_at),
   count(*) FILTER (WHERE e.cause = 'provider_cut'), count(*) FILTER (WHERE e.cause = 'advert_switch'), count(*) FILTER (WHERE coalesce(e.cause,'network_drop') = 'network_drop')
 FROM public.player_buffer_events e
 WHERE e.occurred_at >= (_from::timestamp AT TIME ZONE 'Europe/London') AND e.occurred_at < (_to::timestamp AT TIME ZONE 'Europe/London')
 GROUP BY e.kind, e.content_name ORDER BY count(DISTINCT e.device_id) DESC, count(*) DESC LIMIT 100;
END $$;
REVOKE ALL ON FUNCTION public.player_buffer_summary(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_buffer_summary(date,date) TO authenticated, service_role;