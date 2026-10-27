CREATE OR REPLACE FUNCTION public.consume_enabler_connection(_kind text, _id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE sid uuid; verified uuid; checks jsonb; checked timestamptz; used timestamptz; linked uuid; label text; order_label text;
BEGIN
 IF _kind='ticket' THEN
  SELECT pending_session_id,verified_session_id,app_checks,app_checked_at,checks_used_at INTO sid,verified,checks,checked,used FROM ticket_remote_setup WHERE ticket_id=_id FOR UPDATE;
 ELSIF _kind='order' THEN
  SELECT pending_session_id,verified_session_id,app_checks,app_checked_at,checks_used_at INTO sid,verified,checks,checked,used FROM order_remote_setup WHERE order_id=_id FOR UPDATE;
 ELSE RETURN false; END IF;
 IF sid IS NULL OR sid IS NOT DISTINCT FROM verified OR checked IS NULL OR checked<now()-interval '24 hours' OR (used IS NOT NULL AND used>=checked) OR NOT(coalesce((checks->>'adb')::boolean,false) AND coalesce((checks->>'helper')::boolean,false) AND coalesce((checks->>'accessibility')::boolean,false)) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM tv_remote_sessions WHERE link_kind=_kind AND link_id=_id AND status IN ('pending','claimed','active') AND expires_at>now()) THEN RETURN false; END IF;
 -- Only a Helper code captured in the last 2 minutes: older ones mean Helper has left the TV screen, so Android never shows Allow.
 UPDATE tv_remote_sessions SET link_kind=_kind,link_id=_id,requested_at=now() WHERE id=sid AND status='pending' AND expires_at>now() AND link_id IS NULL AND requested_at IS NULL AND created_at>now()-interval '2 minutes' RETURNING id INTO linked;
 IF linked IS NULL THEN
  IF _kind='ticket' THEN UPDATE ticket_remote_setup SET pending_session_id=NULL,updated_at=now() WHERE ticket_id=_id;
  ELSE UPDATE order_remote_setup SET pending_session_id=NULL,updated_at=now() WHERE order_id=_id; END IF;
  RETURN false;
 END IF;
 IF _kind='ticket' THEN
  UPDATE ticket_remote_setup SET completed_at=now(),checks_used_at=now(),verified_session_id=sid,pending_session_id=NULL,updated_at=now() WHERE ticket_id=_id;
  SELECT subject INTO label FROM tickets WHERE id=_id;
  INSERT INTO tv_remote_events(session_id,actor_id,kind) VALUES(sid,auth.uid(),'customer_requested');
  INSERT INTO staff_notifications(kind,title,body,link_path,entity_id) VALUES('tv_help','Ticket screen share ready','The customer confirmed their TV for ticket: '||label,'/tickets?id='||_id::text||'&tab=screen',sid);
 ELSE
  UPDATE order_remote_setup SET completed_at=now(),checks_used_at=now(),verified_session_id=sid,pending_session_id=NULL,updated_at=now() WHERE order_id=_id;
  SELECT order_ref,existing_username INTO order_label,label FROM orders WHERE id=_id;
  INSERT INTO tv_remote_events(session_id,kind) VALUES(sid,'customer_requested');
  INSERT INTO staff_notifications(kind,title,body,link_path,entity_id) VALUES('tv_help','Order screen share ready',trim(coalesce(nullif(label,''),'A customer')||' confirmed their TV on sale '||coalesce(order_label,'')||'.'),'/screen-share/order/'||_id::text,sid);
 END IF;
 RETURN true;
END $function$;