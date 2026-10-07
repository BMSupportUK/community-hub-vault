CREATE OR REPLACE FUNCTION public.bm_inbox_state(_thread uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); result jsonb;
BEGIN
 IF uid IS NULL OR NOT public.bm_inbox_allowed(uid) THEN RAISE EXCEPTION 'Inbox access denied'; END IF;
 IF _thread IS NOT NULL AND NOT EXISTS(SELECT 1 FROM bm_inbox_threads WHERE id=_thread AND uid IN (user_low,user_high)) THEN RAISE EXCEPTION 'Conversation not found'; END IF;
 SELECT jsonb_build_object(
 'members',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',COALESCE(p.display_name,p.username,'Member'),'username',p.username,'avatar',p.avatar_url,'plate',p.equipped_nameplate_id,'roles',COALESCE((SELECT array_agg(r.role::text) FROM user_roles r WHERE r.user_id=p.id),'{}'::text[])) ORDER BY COALESCE(p.display_name,p.username)) FROM profiles p WHERE public.bm_inbox_allowed(p.id)), '[]'::jsonb),
 'threads',COALESCE((SELECT jsonb_agg(x ORDER BY x.last_at DESC NULLS LAST) FROM (SELECT t.id,CASE WHEN t.user_low=uid THEN t.user_high ELSE t.user_low END other_id, (SELECT CASE WHEN m.deleted_at IS NULL THEN m.body ELSE 'Message deleted' END FROM bm_inbox_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1) last_body, (SELECT max(created_at) FROM bm_inbox_messages m WHERE m.thread_id=t.id) last_at, (SELECT count(*) FROM bm_inbox_messages m WHERE m.thread_id=t.id AND m.sender_id<>uid AND m.deleted_at IS NULL AND m.created_at>CASE WHEN t.user_low=uid THEN t.read_low ELSE t.read_high END) unread FROM bm_inbox_threads t WHERE uid IN (t.user_low,t.user_high)) x),'[]'::jsonb),
 'messages',COALESCE((SELECT jsonb_agg(x ORDER BY x.created_at) FROM (SELECT id,sender_id,CASE WHEN deleted_at IS NULL THEN body ELSE '' END body,created_at,edited_at,deleted_at FROM bm_inbox_messages WHERE thread_id=_thread ORDER BY created_at DESC LIMIT 100) x),'[]'::jsonb),
 'unread',(SELECT count(*) FROM bm_inbox_messages m JOIN bm_inbox_threads t ON t.id=m.thread_id WHERE uid IN (t.user_low,t.user_high) AND m.sender_id<>uid AND m.deleted_at IS NULL AND m.created_at>CASE WHEN t.user_low=uid THEN t.read_low ELSE t.read_high END)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.bm_inbox_state(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bm_inbox_state(uuid) TO authenticated;