CREATE OR REPLACE FUNCTION public.verify_ticket_remote_setup(_ticket_id uuid, _code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE sid uuid; fails int; r ticket_remote_setup; t tickets;
BEGIN
  SELECT * INTO t FROM tickets WHERE id=_ticket_id AND user_id=auth.uid() AND status <> 'closed';
  IF t.id IS NULL THEN RAISE EXCEPTION 'Only the ticket customer can do this'; END IF;
  SELECT * INTO r FROM ticket_remote_setup WHERE ticket_id=_ticket_id;
  IF r.ticket_id IS NULL THEN RAISE EXCEPTION 'Choose your device first'; END IF;
  -- Both device types use the BM TV Enabler one-app flow: its reported checks are the proof.
  IF NOT (COALESCE((r.app_checks->>'adb')::boolean,false) AND COALESCE((r.app_checks->>'helper')::boolean,false) AND COALESCE((r.app_checks->>'accessibility')::boolean,false)) THEN
    RAISE EXCEPTION 'BM TV Enabler has not confirmed your TV yet. Run Check / Turn on remote control in the app first.';
  END IF;
  SELECT count(*) INTO fails FROM tv_remote_events WHERE kind='setup_code_failed:'||_ticket_id AND created_at > now()-interval '15 minutes';
  IF fails >= 8 THEN RAISE EXCEPTION 'Too many wrong codes. Wait 15 minutes.'; END IF;
  SELECT id INTO sid FROM tv_remote_sessions WHERE code_hash=encode(sha256(convert_to(_code,'UTF8')),'hex') AND status='pending' AND expires_at > now() LIMIT 1;
  IF sid IS NULL THEN INSERT INTO tv_remote_events(kind) VALUES ('setup_code_failed:'||_ticket_id); RETURN false; END IF;
  UPDATE ticket_remote_setup SET completed_at=now(), verified_session_id=sid, updated_at=now() WHERE ticket_id=_ticket_id;
  IF NOT EXISTS (SELECT 1 FROM tv_remote_sessions WHERE link_kind='ticket' AND link_id=t.id AND status IN ('pending','claimed','active') AND expires_at>now()) THEN
    UPDATE tv_remote_sessions SET link_kind='ticket', link_id=t.id, requested_at=now() WHERE id=sid AND link_id IS NULL;
    INSERT INTO tv_remote_events(session_id,actor_id,kind) VALUES(sid,auth.uid(),'customer_requested');
    INSERT INTO staff_notifications(kind,title,body,link_path,entity_id) VALUES('tv_help','Ticket screen share ready','The customer confirmed their TV for ticket: '||t.subject,'/tickets?id='||t.id::text||'&tab=screen',sid);
  END IF;
  RETURN true;
END $function$;