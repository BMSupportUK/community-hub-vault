CREATE FUNCTION public.player_buffer_summary(_from date, _to date)
RETURNS TABLE(kind text, content_name text, stalls bigint, devices bigint, reconnects bigint, total_stall_seconds bigint, last_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
 IF NOT coalesce(public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]), false) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 IF _from IS NULL OR _to IS NULL OR _to <= _from THEN RAISE EXCEPTION 'Invalid date range'; END IF;
 RETURN QUERY SELECT e.kind, e.content_name, count(*), count(DISTINCT e.device_id), count(*) FILTER (WHERE e.reconnected), (sum(e.stall_ms) / 1000)::bigint, max(e.occurred_at)
 FROM public.player_buffer_events e
 WHERE e.occurred_at >= (_from::timestamp AT TIME ZONE 'Europe/London') AND e.occurred_at < (_to::timestamp AT TIME ZONE 'Europe/London')
 GROUP BY e.kind, e.content_name ORDER BY count(DISTINCT e.device_id) DESC, count(*) DESC LIMIT 100;
END $$;
REVOKE ALL ON FUNCTION public.player_buffer_summary(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_buffer_summary(date,date) TO authenticated, service_role;
CREATE FUNCTION public.player_buffer_years() RETURNS SETOF integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
 IF NOT coalesce(public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]), false) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 RETURN QUERY SELECT DISTINCT extract(year FROM e.occurred_at AT TIME ZONE 'Europe/London')::integer FROM public.player_buffer_events e ORDER BY 1 DESC;
END $$;
REVOKE ALL ON FUNCTION public.player_buffer_years() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_buffer_years() TO authenticated, service_role;