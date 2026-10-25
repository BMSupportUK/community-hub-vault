ALTER TABLE public.ticket_remote_setup
  ADD COLUMN IF NOT EXISTS setup_code_hash text,
  ADD COLUMN IF NOT EXISTS setup_code_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS app_checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS app_checked_at timestamptz;
COMMENT ON COLUMN public.ticket_remote_setup.confirmed_steps IS 'DEPRECATED: steps are now reported by BM TV Enabler / BM Support app (app_checks)';

CREATE OR REPLACE FUNCTION public.save_ticket_remote_setup(_ticket_id uuid, _device text, _steps integer[])
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF _device NOT IN ('amazon','android') THEN RAISE EXCEPTION 'Choose Amazon or Android'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tickets WHERE id=_ticket_id AND user_id=auth.uid() AND status <> 'closed') THEN RAISE EXCEPTION 'Only the ticket customer can do this'; END IF;
  -- Customers can only choose the device; steps are filled in by the apps.
  INSERT INTO ticket_remote_setup(ticket_id, device, confirmed_steps, completed_at, verified_session_id, app_checks, app_checked_at, updated_at)
  VALUES (_ticket_id, _device, '{}', NULL, NULL, '{}'::jsonb, NULL, now())
  ON CONFLICT (ticket_id) DO UPDATE SET device=EXCLUDED.device, confirmed_steps='{}', completed_at=NULL, verified_session_id=NULL,
    app_checks='{}'::jsonb, app_checked_at=NULL, setup_code_hash=NULL, setup_code_expires_at=NULL, updated_at=now();
END $function$;

CREATE OR REPLACE FUNCTION public.issue_ticket_setup_code(_ticket_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tickets WHERE id=_ticket_id AND user_id=auth.uid() AND status <> 'closed') THEN RAISE EXCEPTION 'Only the ticket customer can do this'; END IF;
  IF NOT EXISTS (SELECT 1 FROM ticket_remote_setup WHERE ticket_id=_ticket_id) THEN RAISE EXCEPTION 'Choose your device first'; END IF;
  c := lpad((floor(random()*100000000))::bigint::text, 8, '0');
  UPDATE ticket_remote_setup SET setup_code_hash=encode(sha256(convert_to(c,'UTF8')),'hex'),
    setup_code_expires_at=now()+interval '2 hours', updated_at=now() WHERE ticket_id=_ticket_id;
  RETURN c;
END $function$;
REVOKE ALL ON FUNCTION public.issue_ticket_setup_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_ticket_setup_code(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.verify_ticket_remote_setup(_ticket_id uuid, _code text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE sid uuid; fails int; r ticket_remote_setup;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tickets WHERE id=_ticket_id AND user_id=auth.uid() AND status <> 'closed') THEN RAISE EXCEPTION 'Only the ticket customer can do this'; END IF;
  SELECT * INTO r FROM ticket_remote_setup WHERE ticket_id=_ticket_id;
  IF r.ticket_id IS NULL THEN RAISE EXCEPTION 'Choose your device first'; END IF;
  IF NOT (COALESCE((r.app_checks->>'adb')::boolean,false) AND COALESCE((r.app_checks->>'helper')::boolean,false) AND COALESCE((r.app_checks->>'accessibility')::boolean,false)) THEN
    RAISE EXCEPTION 'BM TV Enabler has not confirmed your TV yet. Run Check / Turn on remote control in the app first.';
  END IF;
  SELECT count(*) INTO fails FROM tv_remote_events WHERE kind='setup_code_failed:'||_ticket_id AND created_at > now()-interval '15 minutes';
  IF fails >= 8 THEN RAISE EXCEPTION 'Too many wrong codes. Wait 15 minutes.'; END IF;
  SELECT id INTO sid FROM tv_remote_sessions WHERE code_hash=encode(sha256(convert_to(_code,'UTF8')),'hex') AND status='pending' AND expires_at > now() LIMIT 1;
  IF sid IS NULL THEN INSERT INTO tv_remote_events(kind) VALUES ('setup_code_failed:'||_ticket_id); RETURN false; END IF;
  UPDATE ticket_remote_setup SET completed_at=now(), verified_session_id=sid, updated_at=now() WHERE ticket_id=_ticket_id;
  RETURN true;
END $function$;