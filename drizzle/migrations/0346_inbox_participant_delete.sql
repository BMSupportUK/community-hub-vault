CREATE OR REPLACE FUNCTION public.bm_inbox_delete_messages(_thread uuid, _ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); n integer; removed boolean := false;
BEGIN
 IF uid IS NULL OR NOT public.bm_inbox_allowed(uid) THEN RAISE EXCEPTION 'Inbox access denied'; END IF;
 PERFORM 1 FROM public.bm_inbox_threads WHERE id = _thread AND uid IN (user_low, user_high) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found'; END IF;
 DELETE FROM public.bm_inbox_messages m WHERE m.thread_id = _thread
 AND (_ids IS NULL OR m.id = ANY(_ids))
 AND NOT EXISTS (SELECT 1 FROM public.bm_inbox_reports r WHERE r.message_id = m.id);
 GET DIAGNOSTICS n = ROW_COUNT;
 IF NOT EXISTS (SELECT 1 FROM public.bm_inbox_messages WHERE thread_id = _thread) THEN
  DELETE FROM public.bm_inbox_threads WHERE id = _thread;
  removed := true;
 END IF;
 RETURN jsonb_build_object('deleted', n, 'thread_removed', removed);
END $$;
REVOKE ALL ON FUNCTION public.bm_inbox_delete_messages(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bm_inbox_delete_messages(uuid, uuid[]) TO authenticated, service_role;