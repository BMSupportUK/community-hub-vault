CREATE OR REPLACE FUNCTION public.apply_enabler_confirmation(_kind text,_id uuid,_hash text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r enabler_confirm_codes; d text; sid uuid; first_binding boolean;
BEGIN
 IF _kind='ticket' THEN SELECT device INTO d FROM ticket_remote_setup WHERE ticket_id=_id;
 ELSIF _kind='order' THEN SELECT device INTO d FROM order_remote_setup WHERE order_id=_id;
 ELSE RETURN 'invalid'; END IF;
 IF d IS NULL THEN RETURN 'invalid'; END IF;
 SELECT * INTO r FROM enabler_confirm_codes WHERE code_hash=_hash AND expires_at>now() FOR UPDATE;
 IF r.code_hash IS NULL THEN RETURN 'invalid'; END IF;
 IF r.device<>d THEN RETURN 'device_mismatch'; END IF;
 IF (r.bound_ticket_id IS NOT NULL AND (_kind<>'ticket' OR r.bound_ticket_id<>_id)) OR (r.bound_order_id IS NOT NULL AND (_kind<>'order' OR r.bound_order_id<>_id)) THEN RETURN 'scope_mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM tv_remote_sessions WHERE id=r.session_id AND link_id IS NOT NULL AND (link_kind<>_kind OR link_id<>_id)) THEN RETURN 'scope_mismatch'; END IF;
 first_binding:=r.bound_ticket_id IS NULL AND r.bound_order_id IS NULL;
 UPDATE enabler_confirm_codes SET used_at=coalesce(used_at,now()),bound_ticket_id=CASE WHEN _kind='ticket' THEN _id ELSE NULL END,bound_order_id=CASE WHEN _kind='order' THEN _id ELSE NULL END WHERE code_hash=_hash;
 -- Re-entering a valid reference never revives a consumed check or connection.
 IF first_binding THEN
  SELECT id INTO sid FROM tv_remote_sessions WHERE id=r.session_id AND status='pending' AND expires_at>now() AND link_id IS NULL AND requested_at IS NULL;
  IF _kind='ticket' THEN UPDATE ticket_remote_setup SET app_checks=r.checks,app_checked_at=now(),pending_session_id=sid,updated_at=now() WHERE ticket_id=_id;
  ELSE UPDATE order_remote_setup SET app_checks=r.checks,app_checked_at=now(),pending_session_id=sid,updated_at=now() WHERE order_id=_id; END IF;
 END IF;
 RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION public.apply_enabler_confirmation(text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_enabler_confirmation(text,uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.consume_enabler_connection(_kind text,_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid; verified uuid; checks jsonb; checked timestamptz; used timestamptz; linked uuid; label text; order_label text;
BEGIN
 IF _kind='ticket' THEN
  SELECT pending_session_id,verified_session_id,app_checks,app_checked_at,checks_used_at INTO sid,verified,checks,checked,used FROM ticket_remote_setup WHERE ticket_id=_id FOR UPDATE;
 ELSIF _kind='order' THEN
  SELECT pending_session_id,verified_session_id,app_checks,app_checked_at,checks_used_at INTO sid,verified,checks,checked,used FROM order_remote_setup WHERE order_id=_id FOR UPDATE;
 ELSE RETURN false; END IF;
 IF sid IS NULL OR sid IS NOT DISTINCT FROM verified OR checked IS NULL OR checked<now()-interval '24 hours' OR (used IS NOT NULL AND used>=checked) OR NOT(coalesce((checks->>'adb')::boolean,false) AND coalesce((checks->>'helper')::boolean,false) AND coalesce((checks->>'accessibility')::boolean,false)) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM tv_remote_sessions WHERE link_kind=_kind AND link_id=_id AND status IN ('pending','claimed','active') AND expires_at>now()) THEN RETURN false; END IF;
 -- Claim and consume together: a pending session previously requested cannot be reused.
 UPDATE tv_remote_sessions SET link_kind=_kind,link_id=_id,requested_at=now() WHERE id=sid AND status='pending' AND expires_at>now() AND link_id IS NULL AND requested_at IS NULL RETURNING id INTO linked;
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
END $$;
REVOKE ALL ON FUNCTION public.consume_enabler_connection(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_enabler_connection(text,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.connect_ticket_remote_setup(_ticket_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM tickets WHERE id=_ticket_id AND user_id=auth.uid() AND status<>'closed') THEN RAISE EXCEPTION 'Only the ticket customer can do this'; END IF;
 RETURN public.consume_enabler_connection('ticket',_ticket_id);
END $$;
REVOKE ALL ON FUNCTION public.connect_ticket_remote_setup(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.connect_ticket_remote_setup(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.verify_ticket_remote_setup(_ticket_id uuid,_code text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM tickets WHERE id=_ticket_id AND user_id=auth.uid() AND status<>'closed') THEN RAISE EXCEPTION 'Only the ticket customer can do this'; END IF;
 -- Legacy input may only reference the connection already delivered by Enabler.
 IF NOT EXISTS(SELECT 1 FROM ticket_remote_setup r JOIN tv_remote_sessions s ON s.id=r.pending_session_id WHERE r.ticket_id=_ticket_id AND s.code_hash=encode(sha256(convert_to(_code,'UTF8')),'hex')) THEN RETURN false; END IF;
 RETURN public.consume_enabler_connection('ticket',_ticket_id);
END $$;
REVOKE ALL ON FUNCTION public.verify_ticket_remote_setup(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.verify_ticket_remote_setup(uuid,text) TO authenticated;