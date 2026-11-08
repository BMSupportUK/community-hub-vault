ALTER TABLE public.player_buffer_events ADD COLUMN IF NOT EXISTS swapped_to text, ADD COLUMN IF NOT EXISTS swap_reason text CHECK (swap_reason IS NULL OR swap_reason IN ('manual','auto'));
DROP FUNCTION IF EXISTS public.player_buffer_diagnostics(integer, date, date, boolean);
CREATE FUNCTION public.player_buffer_diagnostics(_hours integer DEFAULT 24, _from date DEFAULT NULL::date, _to date DEFAULT NULL::date, _dazn boolean DEFAULT false)
 RETURNS TABLE(kind text, content_name text, event_name text, stalls bigint, devices bigint, reconnects bigint, total_stall_seconds bigint, last_at timestamp with time zone, provider_cuts bigint, advert_switches bigint, network_drops bigint, stream_formats text, decoders text, swapped_away bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT coalesce(public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]),false) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 IF (_from IS NULL) <> (_to IS NULL) OR (_from IS NOT NULL AND _to <= _from) THEN RAISE EXCEPTION 'Invalid date range'; END IF;
 RETURN QUERY SELECT e.kind,e.content_name,e.event_name,count(*) FILTER(WHERE e.swap_reason IS NULL),count(DISTINCT e.device_id),count(*) FILTER(WHERE e.reconnected AND e.swap_reason IS NULL),(sum(e.stall_ms)/1000)::bigint,max(e.occurred_at),count(*) FILTER(WHERE e.cause='provider_cut' AND e.swap_reason IS NULL),count(*) FILTER(WHERE e.cause='advert_switch' AND e.swap_reason IS NULL),count(*) FILTER(WHERE coalesce(e.cause,'network_drop')='network_drop' AND e.swap_reason IS NULL),string_agg(DISTINCT e.stream_format,', '),string_agg(DISTINCT e.decoder,', '),count(*) FILTER(WHERE e.swap_reason IS NOT NULL)
 FROM public.player_buffer_events e
 WHERE e.occurred_at >= CASE WHEN _from IS NULL THEN now()-make_interval(hours=>greatest(1,least(coalesce(_hours,24),720))) ELSE _from::timestamp AT TIME ZONE 'Europe/London' END
 AND e.occurred_at < CASE WHEN _to IS NULL THEN now() ELSE _to::timestamp AT TIME ZONE 'Europe/London' END
 AND (NOT coalesce(_dazn,false) OR e.recovery_provider='dazn' OR lower(normalize(e.content_name,NFKC)) ~ '\mdazn\M')
 GROUP BY e.kind,e.content_name,e.event_name ORDER BY count(*) DESC,count(DISTINCT e.device_id) DESC LIMIT 200;
END $function$;
REVOKE ALL ON FUNCTION public.player_buffer_diagnostics(integer, date, date, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.player_buffer_diagnostics(integer, date, date, boolean) TO authenticated;