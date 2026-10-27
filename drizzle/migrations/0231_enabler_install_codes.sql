-- BM TV Enabler install references: a second code kind that proves the apps are on the TV.
ALTER TABLE public.enabler_confirm_codes ADD COLUMN kind text NOT NULL DEFAULT 'share';
ALTER TABLE public.enabler_confirm_codes ADD CONSTRAINT enabler_confirm_codes_kind_check CHECK (kind IN ('share','install'));

-- Binding an install reference records the app report only (its session_id is always null,
-- so no screen-share connection is attached) and tells the caller it was an install code.
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
 IF EXISTS (SELECT 1 FROM tv_remote_sessions WHERE id=r.session_id AND link_id IS NOT NULL AND (link_kind<>_kind OR link_id<>_id)) THEN RETURN 'scope_mismatch'; END IF;
 first_binding:=r.bound_ticket_id IS NULL AND r.bound_order_id IS NULL;
 UPDATE enabler_confirm_codes SET used_at=coalesce(used_at,now()),bound_ticket_id=CASE WHEN _kind='ticket' THEN _id ELSE NULL END,bound_order_id=CASE WHEN _kind='order' THEN _id ELSE NULL END WHERE code_hash=_hash;
 -- Re-entering a valid reference never revives a consumed check or connection.
 IF first_binding THEN
  SELECT id INTO sid FROM tv_remote_sessions WHERE id=r.session_id AND status='pending' AND expires_at>now() AND link_id IS NULL AND requested_at IS NULL;
  IF _kind='ticket' THEN UPDATE ticket_remote_setup SET app_checks=r.checks,app_checked_at=now(),pending_session_id=sid,updated_at=now() WHERE ticket_id=_id;
  ELSE UPDATE order_remote_setup SET app_checks=r.checks,app_checked_at=now(),pending_session_id=sid,updated_at=now() WHERE order_id=_id; END IF;
 END IF;
 RETURN CASE WHEN r.kind='install' THEN 'ok_install' ELSE 'ok' END;
END $$;
REVOKE ALL ON FUNCTION public.apply_enabler_confirmation(text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_enabler_confirmation(text,uuid,text) TO service_role;

-- Renewals only ever queue on screen-share references, never install references.
CREATE OR REPLACE FUNCTION public.request_enabler_connection(_kind text,_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.enabler_confirm_codes; s public.tv_remote_sessions;
BEGIN
 IF _kind NOT IN ('ticket','order') THEN RETURN 'invalid'; END IF;
 SELECT * INTO r FROM enabler_confirm_codes WHERE kind='share' AND expires_at>now() AND ((_kind='ticket' AND bound_ticket_id=_id) OR (_kind='order' AND bound_order_id=_id)) ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF r.code_hash IS NULL THEN RETURN 'expired'; END IF;
 IF r.refresh_token_hash IS NULL THEN RETURN 'update_app'; END IF;
 SELECT * INTO s FROM tv_remote_sessions WHERE id=r.session_id FOR UPDATE;
 IF s.id IS NOT NULL AND s.expires_at>now() AND s.status IN ('claimed','active') THEN RETURN 'in_progress'; END IF;
 IF s.id IS NOT NULL AND s.status='pending' AND s.expires_at>now() AND s.link_id IS NOT NULL THEN RETURN 'in_progress'; END IF;
 IF r.refresh_state IN ('queued','processing') AND r.refresh_requested_at>now()-interval '3 minutes' THEN RETURN 'queued'; END IF;
 UPDATE enabler_confirm_codes SET refresh_request_id=gen_random_uuid(),refresh_state='queued',refresh_requested_at=now() WHERE code_hash=r.code_hash;
 IF _kind='ticket' THEN UPDATE ticket_remote_setup SET pending_session_id=NULL,updated_at=now() WHERE ticket_id=_id;
 ELSE UPDATE order_remote_setup SET pending_session_id=NULL,updated_at=now() WHERE order_id=_id; END IF;
 RETURN 'queued';
END $$;
REVOKE ALL ON FUNCTION public.request_enabler_connection(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_enabler_connection(text,uuid) TO service_role;