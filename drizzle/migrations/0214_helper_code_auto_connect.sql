ALTER TABLE public.enabler_confirm_codes ADD COLUMN IF NOT EXISTS session_id uuid;
ALTER TABLE public.ticket_remote_setup ADD COLUMN IF NOT EXISTS pending_session_id uuid;
ALTER TABLE public.order_remote_setup ADD COLUMN IF NOT EXISTS pending_session_id uuid;

CREATE OR REPLACE FUNCTION public.redeem_ticket_enabler_code(_ticket_id uuid, _code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.enabler_confirm_codes; d text; k text := 'enabler_code_failed:' || _ticket_id::text; clean text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tickets WHERE id=_ticket_id AND user_id=auth.uid() AND status <> 'closed') THEN RAISE EXCEPTION 'Only the ticket customer can do this'; END IF;
  SELECT device INTO d FROM ticket_remote_setup WHERE ticket_id=_ticket_id;
  IF d IS NULL THEN RAISE EXCEPTION 'Choose your device first'; END IF;
  IF (SELECT count(*) FROM tv_remote_events WHERE kind=k AND created_at > now() - interval '15 minutes') >= 8 THEN RAISE EXCEPTION 'Too many wrong codes. Wait 15 minutes.'; END IF;
  clean := upper(regexp_replace(coalesce(_code,''), '[^A-Za-z0-9]', '', 'g'));
  SELECT * INTO r FROM enabler_confirm_codes WHERE code_hash = encode(sha256(convert_to(clean,'UTF8')),'hex') AND used_at IS NULL AND expires_at > now() FOR UPDATE;
  IF r.code_hash IS NULL THEN INSERT INTO tv_remote_events(kind) VALUES (k); RETURN 'invalid'; END IF;
  IF r.device <> d THEN RETURN 'device_mismatch'; END IF;
  UPDATE enabler_confirm_codes SET used_at = now() WHERE code_hash = r.code_hash;
  UPDATE ticket_remote_setup SET app_checks = r.checks, app_checked_at = now(), pending_session_id = r.session_id, updated_at = now() WHERE ticket_id=_ticket_id;
  RETURN 'ok';
END $$;

CREATE OR REPLACE FUNCTION public.connect_ticket_remote_setup(_ticket_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE sid uuid; r ticket_remote_setup; t tickets;
BEGIN
  SELECT * INTO t FROM tickets WHERE id=_ticket_id AND user_id=auth.uid() AND status <> 'closed';
  IF t.id IS NULL THEN RAISE EXCEPTION 'Only the ticket customer can do this'; END IF;
  SELECT * INTO r FROM ticket_remote_setup WHERE ticket_id=_ticket_id FOR UPDATE;
  IF r.ticket_id IS NULL OR r.pending_session_id IS NULL THEN RETURN false; END IF;
  IF NOT (COALESCE((r.app_checks->>'adb')::boolean,false) AND COALESCE((r.app_checks->>'helper')::boolean,false) AND COALESCE((r.app_checks->>'accessibility')::boolean,false))
     OR r.app_checked_at IS NULL OR r.app_checked_at < now()-interval '2 hours'
     OR (r.checks_used_at IS NOT NULL AND r.checks_used_at >= r.app_checked_at) THEN
    RAISE EXCEPTION 'Check your TV again in BM TV Enabler and type its new code first.';
  END IF;
  SELECT id INTO sid FROM tv_remote_sessions WHERE id=r.pending_session_id AND status='pending' AND expires_at > now();
  IF sid IS NULL THEN UPDATE ticket_remote_setup SET pending_session_id=NULL WHERE ticket_id=_ticket_id; RETURN false; END IF;
  UPDATE ticket_remote_setup SET completed_at=now(), checks_used_at=now(), verified_session_id=sid, pending_session_id=NULL, updated_at=now() WHERE ticket_id=_ticket_id;
  IF NOT EXISTS (SELECT 1 FROM tv_remote_sessions WHERE link_kind='ticket' AND link_id=t.id AND status IN ('pending','claimed','active') AND expires_at>now()) THEN
    UPDATE tv_remote_sessions SET link_kind='ticket', link_id=t.id, requested_at=now() WHERE id=sid AND link_id IS NULL;
    INSERT INTO tv_remote_events(session_id,actor_id,kind) VALUES(sid,auth.uid(),'customer_requested');
    INSERT INTO staff_notifications(kind,title,body,link_path,entity_id) VALUES('tv_help','Ticket screen share ready','The customer confirmed their TV for ticket: '||t.subject,'/tickets?id='||t.id::text||'&tab=screen',sid);
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.connect_ticket_remote_setup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_ticket_remote_setup(uuid) TO authenticated;
UPDATE ticket_remote_setup SET pending_session_id = NULL WHERE false;
DO $$ BEGIN END $$;