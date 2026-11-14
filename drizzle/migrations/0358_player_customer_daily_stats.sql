CREATE TABLE public.player_customer_daily_stats (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, device_id uuid NOT NULL, credential_id uuid, login text NOT NULL DEFAULT '', day date NOT NULL, kind text NOT NULL, title text NOT NULL, category text, platform text, seconds bigint NOT NULL DEFAULT 0, last_watched_at timestamptz NOT NULL, last_ip text, geo_city text, geo_country text, vpn_status text,
 UNIQUE(user_id,device_id,login,day,kind,title)
);
GRANT SELECT ON public.player_customer_daily_stats TO authenticated;
GRANT ALL ON public.player_customer_daily_stats TO service_role;
ALTER TABLE public.player_customer_daily_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_daily_stats_admin ON public.player_customer_daily_stats FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE INDEX customer_daily_stats_user_day ON public.player_customer_daily_stats(user_id,day DESC);
CREATE OR REPLACE FUNCTION public.record_player_watch_activity(_device uuid,_user uuid,_kind text,_title text,_category text,_platform text,_started timestamptz,_ended timestamptz,_seconds integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.player_devices%ROWTYPE; credit integer; a timestamptz; b timestamptz; boundary timestamptz;
BEGIN
 IF _user IS NULL OR _started IS NULL OR length(trim(_title))=0 THEN RETURN; END IF;
 credit:=greatest(0,least(_seconds,180));
 INSERT INTO public.player_watch_activity(user_id,device_id,kind,title,category,platform,started_at,last_watched_at,seconds)
 VALUES(_user,_device,left(_kind,20),left(_title,500),left(_category,200),left(_platform,80),_started,_ended,credit)
 ON CONFLICT(device_id,started_at,kind,title) DO UPDATE SET seconds=player_watch_activity.seconds+excluded.seconds,last_watched_at=greatest(player_watch_activity.last_watched_at,excluded.last_watched_at);
 SELECT * INTO d FROM public.player_devices WHERE id=_device AND user_id=_user;
 IF NOT FOUND OR credit=0 THEN RETURN; END IF;
 a:=_ended-make_interval(secs=>credit);
 WHILE a<_ended LOOP
 boundary:=(((a AT TIME ZONE 'Europe/London')::date+1)::timestamp AT TIME ZONE 'Europe/London');
 b:=least(boundary,_ended);
 INSERT INTO public.player_customer_daily_stats(user_id,device_id,credential_id,login,day,kind,title,category,platform,seconds,last_watched_at,last_ip,geo_city,geo_country,vpn_status)
 VALUES(_user,_device,d.credential_id,coalesce(d.iptv_username,''),(a AT TIME ZONE 'Europe/London')::date,left(_kind,20),left(_title,500),left(_category,200),left(_platform,80),extract(epoch FROM b-a)::bigint,b,d.last_ip,d.geo_city,d.geo_country,d.vpn_status)
 ON CONFLICT(user_id,device_id,login,day,kind,title) DO UPDATE SET seconds=player_customer_daily_stats.seconds+excluded.seconds,last_watched_at=greatest(player_customer_daily_stats.last_watched_at,excluded.last_watched_at),last_ip=excluded.last_ip,geo_city=excluded.geo_city,geo_country=excluded.geo_country,vpn_status=excluded.vpn_status;
 a:=b;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.record_player_watch_activity(uuid,uuid,text,text,text,text,timestamptz,timestamptz,integer) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_player_watch_activity(uuid,uuid,text,text,text,text,timestamptz,timestamptz,integer) TO service_role;
CREATE FUNCTION public.purge_player_customer_daily_stats() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ DELETE FROM public.player_customer_daily_stats WHERE day < (now() AT TIME ZONE 'Europe/London')::date-6 $$;
REVOKE ALL ON FUNCTION public.purge_player_customer_daily_stats() FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.purge_player_customer_daily_stats() TO service_role;
SELECT cron.schedule('purge-player-customer-daily-stats','5 * * * *','select public.purge_player_customer_daily_stats()');