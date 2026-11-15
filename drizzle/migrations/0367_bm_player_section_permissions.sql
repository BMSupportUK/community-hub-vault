CREATE OR REPLACE FUNCTION public.player_section_allowed(_section text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin')
    OR (NOT public.customer_profile_restricted() AND EXISTS (
      SELECT 1 FROM public.page_permissions pp
      JOIN public.user_roles ur ON ur.user_id = auth.uid() AND ur.role::text = ANY (pp.allowed_roles::text[])
      WHERE pp.page_key = 'bm-player-' || _section))
  )
$$;
REVOKE ALL ON FUNCTION public.player_section_allowed(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_section_allowed(text) TO authenticated, service_role;

CREATE POLICY "BM Player section: security read" ON public.player_security_events FOR SELECT TO authenticated USING (public.player_section_allowed('security'));
CREATE POLICY "BM Player section: security update" ON public.player_security_events FOR UPDATE TO authenticated USING (public.player_section_allowed('security')) WITH CHECK (public.player_section_allowed('security'));
CREATE POLICY "BM Player section: devices read" ON public.player_devices FOR SELECT TO authenticated USING (public.player_section_allowed('devices') OR public.player_section_allowed('live') OR public.player_section_allowed('announcements'));
CREATE POLICY "BM Player section: connection limits read" ON public.player_connection_reports FOR SELECT TO authenticated USING (public.player_section_allowed('connection-limits'));
CREATE POLICY "BM Player section: channel health read" ON public.player_channel_health FOR SELECT TO authenticated USING (public.player_section_allowed('channel-status') OR public.player_section_allowed('buffering'));
CREATE POLICY "BM Player section: guide feeds read" ON public.epg_feeds FOR SELECT TO authenticated USING (public.player_section_allowed('guide-matching'));
CREATE POLICY "BM Player section: guide channels read" ON public.epg_feed_channels FOR SELECT TO authenticated USING (public.player_section_allowed('guide-matching'));
CREATE POLICY "BM Player section: guide matches read" ON public.epg_channel_map FOR SELECT TO authenticated USING (public.player_section_allowed('guide-matching'));
CREATE POLICY "BM Player section: guide matches fix" ON public.epg_channel_map FOR UPDATE TO authenticated USING (public.player_section_allowed('guide-matching')) WITH CHECK (public.player_section_allowed('guide-matching'));
CREATE POLICY "BM Player section: announcements read" ON public.player_announcements FOR SELECT TO authenticated USING (public.player_section_allowed('announcements'));
CREATE POLICY "BM Player section: announcements send" ON public.player_announcements FOR INSERT TO authenticated WITH CHECK (public.player_section_allowed('announcements') AND created_by = auth.uid());
CREATE POLICY "BM Player section: announcements end" ON public.player_announcements FOR UPDATE TO authenticated USING (public.player_section_allowed('announcements')) WITH CHECK (public.player_section_allowed('announcements'));
CREATE POLICY "BM Player section: major announcements read" ON public.player_major_announcements FOR SELECT TO authenticated USING (public.player_section_allowed('major-announcements'));
CREATE POLICY "BM Player section: major announcements post" ON public.player_major_announcements FOR INSERT TO authenticated WITH CHECK (public.player_section_allowed('major-announcements') AND created_by = auth.uid());
CREATE POLICY "BM Player section: major announcements remove" ON public.player_major_announcements FOR UPDATE TO authenticated USING (public.player_section_allowed('major-announcements')) WITH CHECK (public.player_section_allowed('major-announcements'));

CREATE OR REPLACE FUNCTION public.admin_feed_switch_summary(p_hours integer DEFAULT 24)
 RETURNS TABLE(content_name text, category text, switches bigint, picture bigint, sound bigint, timing bigint, frame_rate bigint, provider_restart bigint, stalled bigint, devices bigint, last_at timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (coalesce(public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]),false) OR public.player_section_allowed('buffering')) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  RETURN QUERY SELECT s.content_name, max(s.category), count(*),
    count(*) FILTER (WHERE s.switch_type='picture'), count(*) FILTER (WHERE s.switch_type='sound'),
    count(*) FILTER (WHERE s.switch_type='timing'), count(*) FILTER (WHERE s.switch_type='frame_rate'),
    count(*) FILTER (WHERE s.switch_type='provider_restart'), count(*) FILTER (WHERE s.stalled),
    count(DISTINCT s.device_id), max(s.occurred_at)
  FROM public.player_feed_switches s
  WHERE s.occurred_at >= now() - make_interval(hours => greatest(1, least(coalesce(p_hours,24), 720)))
  GROUP BY s.content_name ORDER BY count(*) DESC LIMIT 500;
END $function$;

CREATE OR REPLACE FUNCTION public.player_buffer_diagnostics(_hours integer DEFAULT 24, _from date DEFAULT NULL::date, _to date DEFAULT NULL::date, _dazn boolean DEFAULT false)
 RETURNS TABLE(kind text, content_name text, event_name text, stalls bigint, devices bigint, reconnects bigint, total_stall_seconds bigint, last_at timestamp with time zone, provider_cuts bigint, advert_switches bigint, network_drops bigint, stream_formats text, decoders text, swapped_away bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT (coalesce(public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]),false) OR public.player_section_allowed('buffering')) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 IF (_from IS NULL) <> (_to IS NULL) OR (_from IS NOT NULL AND _to <= _from) THEN RAISE EXCEPTION 'Invalid date range'; END IF;
 RETURN QUERY SELECT e.kind,e.content_name,e.event_name,count(*) FILTER(WHERE e.swap_reason IS NULL),count(DISTINCT e.device_id),count(*) FILTER(WHERE e.reconnected AND e.swap_reason IS NULL),(sum(e.stall_ms)/1000)::bigint,max(e.occurred_at),count(*) FILTER(WHERE e.cause='provider_cut' AND e.swap_reason IS NULL),count(*) FILTER(WHERE e.cause='advert_switch' AND e.swap_reason IS NULL),count(*) FILTER(WHERE coalesce(e.cause,'network_drop')='network_drop' AND e.swap_reason IS NULL),string_agg(DISTINCT e.stream_format,', '),string_agg(DISTINCT e.decoder,', '),count(*) FILTER(WHERE e.swap_reason IS NOT NULL)
 FROM public.player_buffer_events e
 WHERE e.occurred_at >= CASE WHEN _from IS NULL THEN now()-make_interval(hours=>greatest(1,least(coalesce(_hours,24),720))) ELSE _from::timestamp AT TIME ZONE 'Europe/London' END
 AND e.occurred_at < CASE WHEN _to IS NULL THEN now() ELSE _to::timestamp AT TIME ZONE 'Europe/London' END
 AND (NOT coalesce(_dazn,false) OR e.recovery_provider='dazn' OR lower(normalize(e.content_name,NFKC)) ~ '\mdazn\M')
 GROUP BY e.kind,e.content_name,e.event_name ORDER BY count(*) DESC,count(DISTINCT e.device_id) DESC LIMIT 200;
END $function$;

CREATE OR REPLACE FUNCTION public.player_buffer_years()
 RETURNS SETOF integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT (coalesce(public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]), false) OR public.player_section_allowed('buffering')) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 RETURN QUERY SELECT DISTINCT extract(year FROM e.occurred_at AT TIME ZONE 'Europe/London')::integer FROM public.player_buffer_events e ORDER BY 1 DESC;
END $function$;

CREATE OR REPLACE FUNCTION public.player_watch_weekly(_weeks integer)
 RETURNS TABLE(week_start date, kind text, hours numeric, devices bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT date_trunc('week', w.day)::date, w.kind, round(sum(w.seconds) / 3600.0, 1), count(DISTINCT w.device_id)
  FROM public.player_watch_daily w
  WHERE (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management') OR public.player_section_allowed('watch-time'))
    AND w.day >= (date_trunc('week', now() AT TIME ZONE 'Europe/London') - make_interval(weeks => greatest(1, least(_weeks, 52)) - 1))::date
  GROUP BY 1, 2 ORDER BY 1 DESC, 2
$function$;