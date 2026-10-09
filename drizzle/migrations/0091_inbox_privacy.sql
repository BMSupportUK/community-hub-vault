ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS inbox_privacy text NOT NULL DEFAULT 'everyone' CHECK (inbox_privacy IN ('everyone','friends','staff','nobody'));

CREATE OR REPLACE FUNCTION public.bm_inbox_can_message(_sender uuid, _recipient uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id=_sender AND role::text IN ('admin','management')) THEN true
    ELSE CASE COALESCE((SELECT inbox_privacy FROM profiles WHERE id=_recipient),'everyone')
      WHEN 'everyone' THEN true
      WHEN 'nobody' THEN false
      WHEN 'staff' THEN EXISTS (SELECT 1 FROM user_roles WHERE user_id=_sender AND role::text IN ('staff','moderator'))
      WHEN 'friends' THEN EXISTS (SELECT 1 FROM friendships WHERE status::text='accepted' AND ((requester_id=_sender AND addressee_id=_recipient) OR (requester_id=_recipient AND addressee_id=_sender)))
      ELSE true END
  END
$$;

CREATE OR REPLACE FUNCTION public.bm_inbox_set_privacy(_value text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _value NOT IN ('everyone','friends','staff','nobody') THEN RAISE EXCEPTION 'Invalid setting'; END IF;
  UPDATE profiles SET inbox_privacy=_value WHERE id=auth.uid();
  RETURN _value;
END $$;

CREATE OR REPLACE FUNCTION public.bm_inbox_my_privacy()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT inbox_privacy FROM profiles WHERE id=auth.uid()),'everyone')
$$;

REVOKE ALL ON FUNCTION public.bm_inbox_can_message(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bm_inbox_set_privacy(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bm_inbox_my_privacy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bm_inbox_set_privacy(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bm_inbox_my_privacy() TO authenticated;

CREATE OR REPLACE FUNCTION public.bm_inbox_action(_action text, _target uuid, _body text DEFAULT ''::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE uid uuid:=auth.uid(); tid uuid; m bm_inbox_messages%ROWTYPE; rid uuid; recipient uuid;
BEGIN
 IF uid IS NULL OR NOT public.bm_inbox_allowed(uid) THEN RAISE EXCEPTION 'Inbox access denied'; END IF;
 IF _action='start' THEN
  IF _target=uid OR NOT public.bm_inbox_allowed(_target) THEN RAISE EXCEPTION 'Recipient unavailable'; END IF;
  IF NOT public.bm_inbox_can_message(uid,_target) THEN RAISE EXCEPTION 'Recipient not accepting messages'; END IF;
  INSERT INTO bm_inbox_threads(user_low,user_high) VALUES(least(uid,_target),greatest(uid,_target)) ON CONFLICT(user_low,user_high) DO NOTHING;
  SELECT id INTO tid FROM bm_inbox_threads WHERE user_low=least(uid,_target) AND user_high=greatest(uid,_target); RETURN tid;
 ELSIF _action IN ('send','read') THEN
  SELECT id,CASE WHEN user_low=uid THEN user_high ELSE user_low END INTO tid,recipient FROM bm_inbox_threads WHERE id=_target AND uid IN(user_low,user_high);
  IF tid IS NULL THEN RAISE EXCEPTION 'Conversation not found'; END IF;
  IF _action='read' THEN
   UPDATE bm_inbox_threads SET read_low=CASE WHEN user_low=uid THEN now() ELSE read_low END,read_high=CASE WHEN user_high=uid THEN now() ELSE read_high END WHERE id=tid; RETURN tid;
  END IF;
  IF NOT public.bm_inbox_allowed(recipient) THEN RAISE EXCEPTION 'Recipient unavailable'; END IF;
  IF NOT public.bm_inbox_can_message(uid,recipient) THEN RAISE EXCEPTION 'Recipient not accepting messages'; END IF;
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
END $function$;