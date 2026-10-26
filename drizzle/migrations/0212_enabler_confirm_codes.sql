CREATE TABLE public.enabler_confirm_codes (
  code_hash text PRIMARY KEY,
  device text NOT NULL CHECK (device IN ('amazon','android')),
  checks jsonb NOT NULL,
  app text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.enabler_confirm_codes TO service_role;
ALTER TABLE public.enabler_confirm_codes ENABLE ROW LEVEL SECURITY;

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
  UPDATE ticket_remote_setup SET app_checks = r.checks, app_checked_at = now(), updated_at = now() WHERE ticket_id=_ticket_id;
  RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION public.redeem_ticket_enabler_code(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_ticket_enabler_code(uuid, text) TO authenticated;