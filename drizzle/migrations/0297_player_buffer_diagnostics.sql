ALTER TABLE public.player_buffer_events ADD COLUMN IF NOT EXISTS stream_format text CHECK (stream_format IN ('ts','m3u8','direct')), ADD COLUMN IF NOT EXISTS decoder text CHECK (length(decoder)<=120), ADD COLUMN IF NOT EXISTS recovery_provider text CHECK (recovery_provider IN ('dazn')), ADD COLUMN IF NOT EXISTS event_name text CHECK (length(event_name)<=200);
CREATE FUNCTION public.player_buffer_diagnostics(_hours integer DEFAULT 24, _from date DEFAULT NULL, _to date DEFAULT NULL, _dazn boolean DEFAULT false)
RETURNS TABLE(kind text,content_name text,event_name text,stalls bigint,devices bigint,reconnects bigint,total_stall_seconds bigint,last_at timestamptz,provider_cuts bigint,advert_switches bigint,network_drops bigint,stream_formats text,decoders text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT coalesce(public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]),false) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 IF (_from IS NULL) <> (_to IS NULL) OR (_from IS NOT NULL AND _to <= _from) THEN RAISE EXCEPTION 'Invalid date range'; END IF;
 RETURN QUERY SELECT e.kind,e.content_name,e.event_name,count(*),count(DISTINCT e.device_id),count(*) FILTER(WHERE e.reconnected),(sum(e.stall_ms)/1000)::bigint,max(e.occurred_at),count(*) FILTER(WHERE e.cause='provider_cut'),count(*) FILTER(WHERE e.cause='advert_switch'),count(*) FILTER(WHERE coalesce(e.cause,'network_drop')='network_drop'),string_agg(DISTINCT e.stream_format,', '),string_agg(DISTINCT e.decoder,', ')
 FROM public.player_buffer_events e
 WHERE e.occurred_at >= CASE WHEN _from IS NULL THEN now()-make_interval(hours=>greatest(1,least(coalesce(_hours,24),720))) ELSE _from::timestamp AT TIME ZONE 'Europe/London' END
 AND e.occurred_at < CASE WHEN _to IS NULL THEN now() ELSE _to::timestamp AT TIME ZONE 'Europe/London' END
 AND (NOT coalesce(_dazn,false) OR e.recovery_provider='dazn' OR lower(normalize(e.content_name,NFKC)) ~ '\mdazn\M')
 GROUP BY e.kind,e.content_name,e.event_name ORDER BY count(*) DESC,count(DISTINCT e.device_id) DESC LIMIT 200;
END $$;
REVOKE ALL ON FUNCTION public.player_buffer_diagnostics(integer,date,date,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.player_buffer_diagnostics(integer,date,date,boolean) TO authenticated,service_role;