CREATE OR REPLACE FUNCTION public.bm_inbox_delete_many(_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid:=auth.uid(); n integer;
BEGIN
 IF uid IS NULL OR NOT public.bm_inbox_allowed(uid) THEN RAISE EXCEPTION 'Inbox access denied'; END IF;
 WITH deletable AS (
  SELECT msg.id FROM bm_inbox_messages msg
  JOIN bm_inbox_threads t ON t.id=msg.thread_id
  WHERE msg.sender_id=uid
    AND uid IN(t.user_low,t.user_high)
    AND (_ids IS NULL OR msg.id=ANY(_ids))
    AND NOT EXISTS (SELECT 1 FROM bm_inbox_reports r WHERE r.message_id=msg.id)
 ), gone AS (
  DELETE FROM bm_inbox_messages WHERE id IN (SELECT id FROM deletable) RETURNING id
 )
 SELECT count(*) INTO n FROM gone;
 RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.bm_inbox_delete_many(uuid[]) TO authenticated;