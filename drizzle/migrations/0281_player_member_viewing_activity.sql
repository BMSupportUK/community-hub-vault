CREATE TABLE public.player_watch_activity (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, device_id uuid NOT NULL,
 kind text NOT NULL, title text NOT NULL, category text, platform text,
 started_at timestamptz NOT NULL, last_watched_at timestamptz NOT NULL, seconds bigint NOT NULL DEFAULT 0,
 UNIQUE(device_id, started_at, kind, title)
);
GRANT SELECT ON public.player_watch_activity TO authenticated;
GRANT ALL ON public.player_watch_activity TO service_role;
ALTER TABLE public.player_watch_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY player_watch_activity_admin_read ON public.player_watch_activity FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));
CREATE INDEX player_watch_activity_member_recent ON public.player_watch_activity(user_id,last_watched_at DESC);
CREATE OR REPLACE FUNCTION public.record_player_watch_activity(_device uuid,_user uuid,_kind text,_title text,_category text,_platform text,_started timestamptz,_ended timestamptz,_seconds integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 INSERT INTO public.player_watch_activity(user_id,device_id,kind,title,category,platform,started_at,last_watched_at,seconds)
 SELECT _user,_device,left(_kind,20),left(_title,500),left(_category,200),left(_platform,80),_started,_ended,greatest(0,least(_seconds,180))
 WHERE _user IS NOT NULL AND _started IS NOT NULL AND length(trim(_title))>0
 ON CONFLICT(device_id,started_at,kind,title) DO UPDATE SET seconds=player_watch_activity.seconds+excluded.seconds,last_watched_at=greatest(player_watch_activity.last_watched_at,excluded.last_watched_at)
$$;
REVOKE ALL ON FUNCTION public.record_player_watch_activity(uuid,uuid,text,text,text,text,timestamptz,timestamptz,integer) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_player_watch_activity(uuid,uuid,text,text,text,text,timestamptz,timestamptz,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.player_watch_members()
RETURNS TABLE(user_id uuid,username text,seconds bigint,last_watched_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT p.id,p.username,coalesce(w.seconds,0)::bigint,a.last_watched_at FROM public.profiles p
 JOIN (SELECT DISTINCT user_id FROM public.player_devices WHERE user_id IS NOT NULL) d ON d.user_id=p.id
 LEFT JOIN (SELECT d.user_id,sum(w.seconds) AS seconds FROM public.player_watch_daily w JOIN public.player_devices d ON d.id=w.device_id GROUP BY d.user_id) w ON w.user_id=p.id
 LEFT JOIN (SELECT user_id,max(last_watched_at) AS last_watched_at FROM public.player_watch_activity GROUP BY user_id) a ON a.user_id=p.id
 WHERE public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management')
 ORDER BY lower(p.username),p.id
$$;
REVOKE ALL ON FUNCTION public.player_watch_members() FROM public,anon;
GRANT EXECUTE ON FUNCTION public.player_watch_members() TO authenticated;
CREATE OR REPLACE FUNCTION public.player_watch_member_breakdown(_user uuid)
RETURNS TABLE(kind text,seconds bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT w.kind,sum(w.seconds)::bigint FROM public.player_watch_daily w JOIN public.player_devices d ON d.id=w.device_id
 WHERE d.user_id=_user AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management')) GROUP BY w.kind ORDER BY w.kind
$$;
REVOKE ALL ON FUNCTION public.player_watch_member_breakdown(uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.player_watch_member_breakdown(uuid) TO authenticated;