CREATE FUNCTION public.bm_inbox_allowed(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=_uid AND role::text IN ('admin','management','staff','moderator','subscriber','nonsubscriber')) AND NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=_uid AND role::text IN ('banned','rejected','pending')); $$;
REVOKE ALL ON FUNCTION public.bm_inbox_allowed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bm_inbox_allowed(uuid) TO authenticated, service_role;
CREATE TABLE public.bm_inbox_threads (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_low uuid NOT NULL REFERENCES public.profiles(id), user_high uuid NOT NULL REFERENCES public.profiles(id), read_low timestamptz NOT NULL DEFAULT 'epoch', read_high timestamptz NOT NULL DEFAULT 'epoch', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_low,user_high), CHECK(user_low<user_high));
GRANT SELECT ON public.bm_inbox_threads TO authenticated;
GRANT ALL ON public.bm_inbox_threads TO service_role;
ALTER TABLE public.bm_inbox_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY bm_inbox_threads_read ON public.bm_inbox_threads FOR SELECT TO authenticated USING (public.bm_inbox_allowed(auth.uid()) AND auth.uid() IN (user_low,user_high));
CREATE TABLE public.bm_inbox_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), thread_id uuid NOT NULL REFERENCES public.bm_inbox_threads(id), sender_id uuid NOT NULL REFERENCES public.profiles(id), body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 4000), created_at timestamptz NOT NULL DEFAULT now(), edited_at timestamptz, deleted_at timestamptz);
GRANT SELECT ON public.bm_inbox_messages TO authenticated;
GRANT ALL ON public.bm_inbox_messages TO service_role;
ALTER TABLE public.bm_inbox_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY bm_inbox_messages_read ON public.bm_inbox_messages FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.bm_inbox_threads t WHERE t.id=thread_id));
CREATE INDEX bm_inbox_message_thread_time ON public.bm_inbox_messages(thread_id,created_at);
CREATE TABLE public.bm_inbox_reports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid NOT NULL REFERENCES public.bm_inbox_messages(id), reporter_id uuid NOT NULL REFERENCES public.profiles(id), sender_id uuid NOT NULL REFERENCES public.profiles(id), message_snapshot text NOT NULL, reason text NOT NULL CHECK(char_length(reason) BETWEEN 3 AND 1000), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','dismissed')), created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz, reviewed_by uuid REFERENCES public.profiles(id), UNIQUE(message_id,reporter_id));
GRANT SELECT ON public.bm_inbox_reports TO authenticated;
GRANT ALL ON public.bm_inbox_reports TO service_role;
ALTER TABLE public.bm_inbox_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY bm_inbox_reports_read ON public.bm_inbox_reports FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]));
ALTER PUBLICATION supabase_realtime ADD TABLE public.bm_inbox_threads, public.bm_inbox_messages, public.bm_inbox_reports;
CREATE FUNCTION public.bm_inbox_state(_thread uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); result jsonb;
BEGIN
 IF uid IS NULL OR NOT public.bm_inbox_allowed(uid) THEN RAISE EXCEPTION 'Inbox access denied'; END IF;
 IF _thread IS NOT NULL AND NOT EXISTS(SELECT 1 FROM bm_inbox_threads WHERE id=_thread AND uid IN (user_low,user_high)) THEN RAISE EXCEPTION 'Conversation not found'; END IF;
 SELECT jsonb_build_object(
 'members',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',COALESCE(p.display_name,p.username,'Member'),'username',p.username,'avatar',p.avatar_url,'plate',p.equipped_nameplate_id) ORDER BY COALESCE(p.display_name,p.username)) FROM profiles p WHERE public.bm_inbox_allowed(p.id)), '[]'::jsonb),
 'threads',COALESCE((SELECT jsonb_agg(x ORDER BY x.last_at DESC NULLS LAST) FROM (SELECT t.id,CASE WHEN t.user_low=uid THEN t.user_high ELSE t.user_low END other_id, (SELECT CASE WHEN m.deleted_at IS NULL THEN m.body ELSE 'Message deleted' END FROM bm_inbox_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1) last_body, (SELECT max(created_at) FROM bm_inbox_messages m WHERE m.thread_id=t.id) last_at, (SELECT count(*) FROM bm_inbox_messages m WHERE m.thread_id=t.id AND m.sender_id<>uid AND m.deleted_at IS NULL AND m.created_at>CASE WHEN t.user_low=uid THEN t.read_low ELSE t.read_high END) unread FROM bm_inbox_threads t WHERE uid IN (t.user_low,t.user_high)) x),'[]'::jsonb),
 'messages',COALESCE((SELECT jsonb_agg(x ORDER BY x.created_at) FROM (SELECT id,sender_id,CASE WHEN deleted_at IS NULL THEN body ELSE '' END body,created_at,edited_at,deleted_at FROM bm_inbox_messages WHERE thread_id=_thread ORDER BY created_at DESC LIMIT 100) x),'[]'::jsonb),
 'unread',(SELECT count(*) FROM bm_inbox_messages m JOIN bm_inbox_threads t ON t.id=m.thread_id WHERE uid IN (t.user_low,t.user_high) AND m.sender_id<>uid AND m.deleted_at IS NULL AND m.created_at>CASE WHEN t.user_low=uid THEN t.read_low ELSE t.read_high END)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.bm_inbox_state(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bm_inbox_state(uuid) TO authenticated;
CREATE FUNCTION public.bm_inbox_action(_action text,_target uuid,_body text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); tid uuid; m bm_inbox_messages%ROWTYPE; rid uuid; recipient uuid;
BEGIN
 IF uid IS NULL OR NOT public.bm_inbox_allowed(uid) THEN RAISE EXCEPTION 'Inbox access denied'; END IF;
 IF _action='start' THEN
  IF _target=uid OR NOT public.bm_inbox_allowed(_target) THEN RAISE EXCEPTION 'Recipient unavailable'; END IF;
  INSERT INTO bm_inbox_threads(user_low,user_high) VALUES(least(uid,_target),greatest(uid,_target)) ON CONFLICT(user_low,user_high) DO NOTHING;
  SELECT id INTO tid FROM bm_inbox_threads WHERE user_low=least(uid,_target) AND user_high=greatest(uid,_target); RETURN tid;
 ELSIF _action IN ('send','read') THEN
  SELECT id,CASE WHEN user_low=uid THEN user_high ELSE user_low END INTO tid,recipient FROM bm_inbox_threads WHERE id=_target AND uid IN(user_low,user_high);
  IF tid IS NULL THEN RAISE EXCEPTION 'Conversation not found'; END IF;
  IF _action='read' THEN
   UPDATE bm_inbox_threads SET read_low=CASE WHEN user_low=uid THEN now() ELSE read_low END,read_high=CASE WHEN user_high=uid THEN now() ELSE read_high END WHERE id=tid; RETURN tid;
  END IF;
  IF NOT public.bm_inbox_allowed(recipient) THEN RAISE EXCEPTION 'Recipient unavailable'; END IF;
  IF char_length(btrim(_body)) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Message must be 1–4000 characters'; END IF;
  INSERT INTO bm_inbox_messages(thread_id,sender_id,body) VALUES(tid,uid,btrim(_body)) RETURNING id INTO rid;
  RETURN rid;
 ELSIF _action IN ('edit','delete','report') THEN
  SELECT msg.* INTO m FROM bm_inbox_messages msg JOIN bm_inbox_threads t ON t.id=msg.thread_id WHERE msg.id=_target AND uid IN(t.user_low,t.user_high);
  IF m.id IS NULL OR m.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Message unavailable'; END IF;
  IF _action IN ('edit','delete') THEN
   IF m.sender_id<>uid THEN RAISE EXCEPTION 'Only your own messages can be changed'; END IF;
   IF _action='edit' THEN
    IF char_length(btrim(_body)) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Message must be 1–4000 characters'; END IF;
    UPDATE bm_inbox_messages SET body=btrim(_body),edited_at=now() WHERE id=m.id;
   ELSE UPDATE bm_inbox_messages SET body='Message deleted',deleted_at=now() WHERE id=m.id; END IF;
   RETURN m.id;
  END IF;
  IF m.sender_id=uid THEN RAISE EXCEPTION 'Cannot report your own message'; END IF;
  IF char_length(btrim(_body)) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Describe the issue (3–1000 characters)'; END IF;
  INSERT INTO bm_inbox_reports(message_id,reporter_id,sender_id,message_snapshot,reason) VALUES(m.id,uid,m.sender_id,m.body,btrim(_body)) ON CONFLICT(message_id,reporter_id) DO NOTHING RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
   INSERT INTO user_notifications(user_id,kind,title,body,link_path,source_type,source_id) SELECT DISTINCT user_id,'content_report','BM Support inbox report','A private message has been reported.','/inbox-reports','bm_inbox_report',rid FROM user_roles WHERE role::text IN ('admin','management');
  END IF;
  RETURN COALESCE(rid,m.id);
 ELSE RAISE EXCEPTION 'Unknown action'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.bm_inbox_action(text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bm_inbox_action(text,uuid,text) TO authenticated;
CREATE FUNCTION public.bm_inbox_review(_id uuid DEFAULT NULL,_status text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::app_role[]) THEN RAISE EXCEPTION 'Admin and management only'; END IF;
 IF _id IS NOT NULL THEN
  IF _status NOT IN ('reviewed','dismissed') OR _status IS NULL THEN RAISE EXCEPTION 'Invalid review status'; END IF;
  UPDATE bm_inbox_reports SET status=_status,reviewed_at=now(),reviewed_by=auth.uid() WHERE id=_id;
 END IF;
 RETURN COALESCE((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (SELECT r.*,COALESCE(p.display_name,p.username,'Member') reporter_name,COALESCE(s.display_name,s.username,'Member') sender_name FROM bm_inbox_reports r JOIN profiles p ON p.id=r.reporter_id JOIN profiles s ON s.id=r.sender_id ORDER BY r.created_at DESC LIMIT 200) x),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.bm_inbox_review(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bm_inbox_review(uuid,text) TO authenticated;