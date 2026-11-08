-- lovable-cron-fallback-reviewed: wake on enqueue, one ten-minute retry job only while queue exists, unschedule after drain; immediate HTTP dispatch handles normal work
ALTER TABLE public.epg_feeds ADD COLUMN successful_at timestamptz;
UPDATE public.epg_feeds SET successful_at=imported_at WHERE error IS NULL;
CREATE TABLE public.epg_refresh_queue(code text PRIMARY KEY,requested_at timestamptz NOT NULL DEFAULT now(),retry_at timestamptz NOT NULL DEFAULT now(),lease uuid,lease_until timestamptz,attempts integer NOT NULL DEFAULT 0,last_error text,wake_hash text);
GRANT ALL ON public.epg_refresh_queue TO service_role;
ALTER TABLE public.epg_refresh_queue ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.epg_import_batches(run_id uuid NOT NULL,kind text NOT NULL,part integer NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(run_id,kind,part));
GRANT ALL ON public.epg_import_batches TO service_role;
ALTER TABLE public.epg_import_batches ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.arm_epg_retry() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(808613);
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='epg-demand-retry') THEN PERFORM cron.schedule('epg-demand-retry','*/10 * * * *','select public.dispatch_epg_demand()'); END IF;
END $$;
REVOKE ALL ON FUNCTION public.arm_epg_retry() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arm_epg_retry() TO service_role;
CREATE FUNCTION public.dispatch_epg_demand() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE r record; token text; sent integer:=0;
BEGIN
 FOR r IN SELECT code FROM public.epg_refresh_queue WHERE retry_at<=now() AND (lease_until IS NULL OR lease_until<=now()) ORDER BY requested_at LIMIT 3 FOR UPDATE SKIP LOCKED LOOP
  token:=gen_random_uuid()::text||gen_random_uuid()::text;
  UPDATE public.epg_refresh_queue SET wake_hash=encode(digest(token,'sha256'),'hex'),retry_at=now()+interval '10 minutes' WHERE code=r.code;
  PERFORM net.http_post(url:='https://project--5e1fe153-4c10-4ade-8c98-e355fcdea791.lovable.app/api/public/hooks/epg-demand',body:=jsonb_build_object('feed',r.code,'wake',token),timeout_milliseconds:=300000);
  sent:=sent+1;
 END LOOP;
 PERFORM pg_advisory_xact_lock(808613);
 IF NOT EXISTS(SELECT 1 FROM public.epg_refresh_queue) THEN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='epg-demand-retry'; END IF;
 RETURN sent;
END $$;
REVOKE ALL ON FUNCTION public.dispatch_epg_demand() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_epg_demand() TO service_role;
CREATE FUNCTION public.request_epg_feeds(p_codes text[]) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c text; queued integer:=0;
BEGIN
 IF cardinality(p_codes)>3 THEN RAISE EXCEPTION 'Too many feeds'; END IF;
 FOR c IN SELECT DISTINCT unnest(p_codes) LOOP
  IF c !~ '^[A-Z0-9_]{2,20}$' THEN RAISE EXCEPTION 'Invalid feed'; END IF;
  IF EXISTS(SELECT 1 FROM public.epg_feeds WHERE code=c AND successful_at>now()-interval '6 hours') THEN CONTINUE; END IF;
  INSERT INTO public.epg_refresh_queue(code) VALUES(c) ON CONFLICT(code) DO NOTHING;
  queued:=queued+1;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.epg_refresh_queue) THEN PERFORM public.arm_epg_retry(); PERFORM public.dispatch_epg_demand(); END IF;
 RETURN queued;
END $$;
REVOKE ALL ON FUNCTION public.request_epg_feeds(text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_epg_feeds(text[]) TO service_role;
CREATE FUNCTION public.claim_epg_feed(p_code text,p_wake text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE token uuid;
BEGIN
 IF p_wake IS NULL THEN INSERT INTO public.epg_refresh_queue(code) VALUES(p_code) ON CONFLICT(code) DO NOTHING; END IF;
 UPDATE public.epg_refresh_queue SET lease=gen_random_uuid(),lease_until=now()+interval '10 minutes',attempts=attempts+1,wake_hash=NULL WHERE code=p_code AND (lease_until IS NULL OR lease_until<=now()) AND (p_wake IS NULL OR wake_hash=encode(digest(p_wake,'sha256'),'hex')) RETURNING lease INTO token;
 RETURN token;
END $$;
REVOKE ALL ON FUNCTION public.claim_epg_feed(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_epg_feed(text,text) TO service_role;
CREATE FUNCTION public.finish_epg_import(p_code text,p_run uuid,p_counts jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM public.epg_refresh_queue WHERE code=p_code AND lease=p_run AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Import lease expired'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.epg_import_batches WHERE run_id=p_run AND kind='programmes') THEN RAISE EXCEPTION 'No programmes staged'; END IF;
 DELETE FROM public.epg_programmes WHERE feed=p_code;
 INSERT INTO public.epg_programmes(feed,epg_id,start_at,stop_at,title,descr) SELECT p_code,r.epg_id,r.start_at,r.stop_at,r.title,r.descr FROM public.epg_import_batches b CROSS JOIN LATERAL jsonb_to_recordset(b.payload) r(epg_id text,start_at timestamptz,stop_at timestamptz,title text,descr text) WHERE b.run_id=p_run AND b.kind='programmes';
 DELETE FROM public.epg_feed_channels WHERE feed=p_code;
 INSERT INTO public.epg_feed_channels(feed,epg_id,name) SELECT p_code,r.epg_id,r.name FROM public.epg_import_batches b CROSS JOIN LATERAL jsonb_to_recordset(b.payload) r(epg_id text,name text) WHERE b.run_id=p_run AND b.kind='channels';
 INSERT INTO public.epg_channel_map(channel_key,channel_name,category,feed,epg_id,epg_name,updated_at) SELECT r.channel_key,r.channel_name,r.category,r.feed,r.epg_id,r.epg_name,now() FROM public.epg_import_batches b CROSS JOIN LATERAL jsonb_to_recordset(b.payload) r(channel_key text,channel_name text,category text,feed text,epg_id text,epg_name text) WHERE b.run_id=p_run AND b.kind='matches' ON CONFLICT(channel_key) DO UPDATE SET channel_name=excluded.channel_name,category=excluded.category,feed=excluded.feed,epg_id=excluded.epg_id,epg_name=excluded.epg_name,updated_at=excluded.updated_at WHERE NOT epg_channel_map.manual;
 INSERT INTO public.epg_feeds(code,imported_at,successful_at,channels,matched,programmes,error) VALUES(p_code,now(),now(),(p_counts->>'channels')::integer,(p_counts->>'matched')::integer,(p_counts->>'programmes')::integer,NULL) ON CONFLICT(code) DO UPDATE SET imported_at=now(),successful_at=now(),channels=excluded.channels,matched=excluded.matched,programmes=excluded.programmes,error=NULL;
 DELETE FROM public.epg_import_batches WHERE run_id=p_run OR created_at<now()-interval '1 day';
 DELETE FROM public.epg_refresh_queue WHERE code=p_code AND lease=p_run;
 PERFORM public.dispatch_epg_demand();
END $$;
REVOKE ALL ON FUNCTION public.finish_epg_import(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_epg_import(text,uuid,jsonb) TO service_role;
CREATE FUNCTION public.fail_epg_import(p_code text,p_run uuid,p_error text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.epg_refresh_queue SET lease=NULL,lease_until=NULL,last_error=left(p_error,300),retry_at=now()+interval '10 minutes' WHERE code=p_code AND lease=p_run;
 IF NOT FOUND THEN RETURN; END IF;
 INSERT INTO public.epg_feeds(code,imported_at,error) VALUES(p_code,now(),left(p_error,300)) ON CONFLICT(code) DO UPDATE SET imported_at=now(),error=excluded.error;
 DELETE FROM public.epg_import_batches WHERE run_id=p_run;
 PERFORM public.arm_epg_retry();
END $$;
REVOKE ALL ON FUNCTION public.fail_epg_import(text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fail_epg_import(text,uuid,text) TO service_role;