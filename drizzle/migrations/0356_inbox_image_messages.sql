ALTER TABLE public.bm_inbox_messages ADD COLUMN IF NOT EXISTS image_path text;

CREATE OR REPLACE FUNCTION public.bm_inbox_image_allowed(_path text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE tid uuid;
BEGIN
  IF _path IS NULL OR _path !~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/[^/]+$' THEN RETURN false; END IF;
  tid := split_part(_path,'/',1)::uuid;
  RETURN EXISTS(SELECT 1 FROM bm_inbox_threads WHERE id=tid AND auth.uid() IN (user_low,user_high));
END
$func$;

CREATE OR REPLACE FUNCTION public.bm_inbox_send_image(_thread uuid, _path text, _caption text DEFAULT '')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE uid uuid:=auth.uid(); tid uuid; recipient uuid; rid uuid;
BEGIN
  IF uid IS NULL OR NOT public.bm_inbox_allowed(uid) THEN RAISE EXCEPTION 'Inbox access denied'; END IF;
  SELECT id, CASE WHEN user_low=uid THEN user_high ELSE user_low END INTO tid, recipient FROM bm_inbox_threads WHERE id=_thread AND uid IN (user_low,user_high);
  IF tid IS NULL THEN RAISE EXCEPTION 'Conversation not found'; END IF;
  IF NOT public.bm_inbox_allowed(recipient) THEN RAISE EXCEPTION 'Recipient unavailable'; END IF;
  IF NOT public.bm_inbox_can_message(uid,recipient) THEN RAISE EXCEPTION 'Recipient not accepting messages'; END IF;
  IF _path IS NULL OR _path NOT LIKE (tid::text || '/' || uid::text || '/%') THEN RAISE EXCEPTION 'Invalid image'; END IF;
  IF char_length(btrim(_caption)) > 4000 THEN RAISE EXCEPTION 'Caption too long'; END IF;
  INSERT INTO bm_inbox_messages(thread_id,sender_id,body,image_path) VALUES(tid,uid,btrim(_caption),_path) RETURNING id INTO rid;
  RETURN rid;
END
$func$;

GRANT EXECUTE ON FUNCTION public.bm_inbox_send_image(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bm_inbox_image_allowed(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.bm_inbox_state(_thread uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE uid uuid:=auth.uid(); result jsonb;
BEGIN
  IF uid IS NULL OR NOT public.bm_inbox_allowed(uid) THEN RAISE EXCEPTION 'Inbox access denied'; END IF;
  IF _thread IS NOT NULL AND NOT EXISTS(SELECT 1 FROM bm_inbox_threads WHERE id=_thread AND uid IN (user_low,user_high)) THEN RAISE EXCEPTION 'Conversation not found'; END IF;
  SELECT jsonb_build_object(
    'members',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',COALESCE(p.display_name,p.username,'Member'),'username',p.username,'avatar',p.avatar_url,'plate',p.equipped_nameplate_id,'roles',COALESCE((SELECT array_agg(r.role::text) FROM user_roles r WHERE r.user_id=p.id),'{}'::text[])) ORDER BY COALESCE(p.display_name,p.username)) FROM profiles p WHERE public.bm_inbox_allowed(p.id)), '[]'::jsonb),
    'threads',COALESCE((SELECT jsonb_agg(x ORDER BY x.last_at DESC NULLS LAST) FROM (SELECT t.id,CASE WHEN t.user_low=uid THEN t.user_high ELSE t.user_low END other_id, (SELECT CASE WHEN m.deleted_at IS NOT NULL THEN 'Message deleted' WHEN m.image_path IS NOT NULL AND btrim(m.body)='' THEN '📷 Photo' ELSE m.body END FROM bm_inbox_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1) last_body, (SELECT max(created_at) FROM bm_inbox_messages m WHERE m.thread_id=t.id) last_at, (SELECT count(*) FROM bm_inbox_messages m WHERE m.thread_id=t.id AND m.sender_id<>uid AND m.deleted_at IS NULL AND m.created_at>CASE WHEN t.user_low=uid THEN t.read_low ELSE t.read_high END) unread FROM bm_inbox_threads t WHERE uid IN (t.user_low,t.user_high)) x),'[]'::jsonb),
    'messages',COALESCE((SELECT jsonb_agg(x ORDER BY x.created_at) FROM (SELECT id,sender_id,CASE WHEN deleted_at IS NULL THEN body ELSE '' END body,CASE WHEN deleted_at IS NULL THEN image_path ELSE NULL END image_path,created_at,edited_at,deleted_at FROM bm_inbox_messages WHERE thread_id=_thread ORDER BY created_at DESC LIMIT 100) x),'[]'::jsonb),
    'unread',(SELECT count(*) FROM bm_inbox_messages m JOIN bm_inbox_threads t ON t.id=m.thread_id WHERE uid IN (t.user_low,t.user_high) AND m.sender_id<>uid AND m.deleted_at IS NULL AND m.created_at>CASE WHEN t.user_low=uid THEN t.read_low ELSE t.read_high END)) INTO result;
  RETURN result;
END
$func$;

CREATE POLICY inbox_images_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='inbox-images' AND split_part(name,'/',2)=auth.uid()::text AND public.bm_inbox_image_allowed(name));

CREATE POLICY inbox_images_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='inbox-images' AND public.bm_inbox_image_allowed(name));

CREATE POLICY inbox_images_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='inbox-images' AND split_part(name,'/',2)=auth.uid()::text);