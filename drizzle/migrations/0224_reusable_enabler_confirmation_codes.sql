ALTER TABLE public.enabler_confirm_codes ADD COLUMN IF NOT EXISTS bound_ticket_id uuid;
ALTER TABLE public.enabler_confirm_codes ADD COLUMN IF NOT EXISTS bound_order_id uuid;
CREATE OR REPLACE FUNCTION public.apply_enabler_confirmation(_kind text, _id uuid, _hash text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.enabler_confirm_codes; d text; sid uuid;
BEGIN
  IF _kind='ticket' THEN SELECT device INTO d FROM ticket_remote_setup WHERE ticket_id=_id;
  ELSIF _kind='order' THEN SELECT device INTO d FROM order_remote_setup WHERE order_id=_id;
  ELSE RETURN 'invalid'; END IF;
  IF d IS NULL THEN RETURN 'invalid'; END IF;
  SELECT * INTO r FROM enabler_confirm_codes WHERE code_hash=_hash AND expires_at>now() FOR UPDATE;
  IF r.code_hash IS NULL THEN RETURN 'invalid'; END IF;
  IF r.device<>d THEN RETURN 'device_mismatch'; END IF;
  IF (r.bound_ticket_id IS NOT NULL AND (_kind<>'ticket' OR r.bound_ticket_id<>_id)) OR (r.bound_order_id IS NOT NULL AND (_kind<>'order' OR r.bound_order_id<>_id)) THEN RETURN 'scope_mismatch'; END IF;
  SELECT id INTO sid FROM tv_remote_sessions WHERE id=r.session_id AND status='pending' AND expires_at>now() AND (link_id IS NULL OR (link_kind=_kind AND link_id=_id));
  IF EXISTS (SELECT 1 FROM tv_remote_sessions WHERE id=r.session_id AND link_id IS NOT NULL AND (link_kind<>_kind OR link_id<>_id)) THEN RETURN 'scope_mismatch'; END IF;
  UPDATE enabler_confirm_codes SET used_at=coalesce(used_at,now()), bound_ticket_id=CASE WHEN _kind='ticket' THEN _id ELSE NULL END, bound_order_id=CASE WHEN _kind='order' THEN _id ELSE NULL END WHERE code_hash=_hash;
  IF _kind='ticket' THEN
    UPDATE ticket_remote_setup SET app_checks=r.checks, app_checked_at=now(), pending_session_id=sid, updated_at=now() WHERE ticket_id=_id;
  ELSE
    UPDATE order_remote_setup SET app_checks=r.checks, app_checked_at=now(), pending_session_id=sid, updated_at=now() WHERE order_id=_id;
  END IF;
  RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION public.apply_enabler_confirmation(text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_enabler_confirmation(text,uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.redeem_ticket_enabler_code(_ticket_id uuid,_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE k text:='enabler_code_failed:'||_ticket_id::text; clean text; result text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tickets WHERE id=_ticket_id AND user_id=auth.uid() AND status<>'closed') THEN RAISE EXCEPTION 'Only the ticket customer can do this'; END IF;
  IF (SELECT count(*) FROM tv_remote_events WHERE kind=k AND created_at>now()-interval '15 minutes')>=8 THEN RAISE EXCEPTION 'Too many wrong codes. Wait 15 minutes.'; END IF;
  clean:=upper(regexp_replace(coalesce(_code,''),'[^A-Za-z0-9]','','g'));
  result:=public.apply_enabler_confirmation('ticket',_ticket_id,encode(sha256(convert_to(clean,'UTF8')),'hex'));
  IF result='invalid' THEN INSERT INTO tv_remote_events(kind) VALUES(k); END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.redeem_ticket_enabler_code(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.redeem_ticket_enabler_code(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.redeem_order_enabler_code(_order_id uuid,_code_hash text)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT public.apply_enabler_confirmation('order',_order_id,_code_hash); $$;
REVOKE ALL ON FUNCTION public.redeem_order_enabler_code(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_order_enabler_code(uuid,text) TO service_role;