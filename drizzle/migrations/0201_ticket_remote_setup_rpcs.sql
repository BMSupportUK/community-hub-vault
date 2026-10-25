ALTER TABLE public.ticket_remote_setup ADD COLUMN IF NOT EXISTS verified_session_id uuid;
DROP POLICY IF EXISTS "Ticket customer inserts" ON public.ticket_remote_setup;
DROP POLICY IF EXISTS "Ticket customer updates" ON public.ticket_remote_setup;
DROP POLICY IF EXISTS "Ticket customer resets" ON public.ticket_remote_setup;
REVOKE INSERT, UPDATE, DELETE ON public.ticket_remote_setup FROM authenticated;

CREATE OR REPLACE FUNCTION public.save_ticket_remote_setup(_ticket_id uuid, _device text, _steps int[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _device NOT IN ('amazon','android') THEN RAISE EXCEPTION 'Choose Amazon or Android'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tickets WHERE id=_ticket_id AND user_id=auth.uid() AND status <> 'closed') THEN RAISE EXCEPTION 'Only the ticket customer can do this'; END IF;
  INSERT INTO ticket_remote_setup(ticket_id, device, confirmed_steps, completed_at, verified_session_id, updated_at)
  VALUES (_ticket_id, _device, COALESCE(_steps,'{}'), NULL, NULL, now())
  ON CONFLICT (ticket_id) DO UPDATE SET device=EXCLUDED.device, confirmed_steps=EXCLUDED.confirmed_steps, completed_at=NULL, verified_session_id=NULL, updated_at=now();
END $$;

-- Final step: the TV helper app must be open and showing a live code it fetched from our server.
CREATE OR REPLACE FUNCTION public.verify_ticket_remote_setup(_ticket_id uuid, _code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sid uuid; fails int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tickets WHERE id=_ticket_id AND user_id=auth.uid() AND status <> 'closed') THEN RAISE EXCEPTION 'Only the ticket customer can do this'; END IF;
  IF NOT EXISTS (SELECT 1 FROM ticket_remote_setup WHERE ticket_id=_ticket_id) THEN RAISE EXCEPTION 'Choose your device first'; END IF;
  SELECT count(*) INTO fails FROM tv_remote_events WHERE kind='setup_code_failed:'||_ticket_id AND created_at > now()-interval '15 minutes';
  IF fails >= 8 THEN RAISE EXCEPTION 'Too many wrong codes. Wait 15 minutes.'; END IF;
  SELECT id INTO sid FROM tv_remote_sessions WHERE code_hash=encode(sha256(convert_to(_code,'UTF8')),'hex') AND status='pending' AND expires_at > now() LIMIT 1;
  IF sid IS NULL THEN
    INSERT INTO tv_remote_events(kind) VALUES ('setup_code_failed:'||_ticket_id);
    RETURN false;
  END IF;
  UPDATE ticket_remote_setup SET completed_at=now(), verified_session_id=sid, updated_at=now() WHERE ticket_id=_ticket_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.save_ticket_remote_setup(uuid,text,int[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_ticket_remote_setup(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_ticket_remote_setup(uuid,text,int[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_ticket_remote_setup(uuid,text) TO authenticated;