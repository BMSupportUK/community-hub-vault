ALTER TABLE public.player_customer_daily_stats
 ADD COLUMN IF NOT EXISTS speed_kbps_sum bigint NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS speed_samples integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS speed_min_kbps integer,
 ADD COLUMN IF NOT EXISTS speed_max_kbps integer,
 ADD COLUMN IF NOT EXISTS bitrate_kbps integer;
CREATE OR REPLACE FUNCTION public.record_player_watch_speed(_device uuid,_user uuid,_kind text,_title text,_speed integer,_bitrate integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s integer:=CASE WHEN _speed BETWEEN 1 AND 2000000 THEN _speed END;
 r integer:=CASE WHEN _bitrate BETWEEN 1 AND 200000 THEN _bitrate END;
BEGIN
 IF _user IS NULL OR (s IS NULL AND r IS NULL) THEN RETURN; END IF;
 UPDATE public.player_customer_daily_stats SET
  speed_kbps_sum=speed_kbps_sum+coalesce(s,0),
  speed_samples=speed_samples+CASE WHEN s IS NULL THEN 0 ELSE 1 END,
  speed_min_kbps=CASE WHEN s IS NULL THEN speed_min_kbps ELSE least(coalesce(speed_min_kbps,s),s) END,
  speed_max_kbps=CASE WHEN s IS NULL THEN speed_max_kbps ELSE greatest(coalesce(speed_max_kbps,s),s) END,
  bitrate_kbps=coalesce(r,bitrate_kbps)
 WHERE user_id=_user AND device_id=_device AND day=(now() AT TIME ZONE 'Europe/London')::date AND kind=left(_kind,20) AND title=left(_title,500);
END $$;
REVOKE ALL ON FUNCTION public.record_player_watch_speed(uuid,uuid,text,text,integer,integer) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_player_watch_speed(uuid,uuid,text,text,integer,integer) TO service_role;