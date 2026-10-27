CREATE OR REPLACE FUNCTION public.apply_enabler_confirmation(_kind text,_id uuid,_hash text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r enabler_confirm_codes; d text; sid uuid; same_scope boolean;
BEGIN
 IF _kind='ticket' THEN SELECT device INTO d FROM ticket_remote_setup WHERE ticket_id=_id;
 ELSIF _kind='order' THEN SELECT device INTO d FROM order_remote_setup WHERE order_id=_id;
 ELSE RETURN 'invalid'; END IF;
 IF d IS NULL THEN RETURN 'invalid'; END IF;
 SELECT * INTO r FROM enabler_confirm_codes WHERE code_hash=_hash AND expires_at>now() FOR UPDATE;
 IF r.code_hash IS NULL THEN RETURN 'invalid'; END IF;
 IF r.device<>d THEN RETURN 'device_mismatch'; END IF;
 same_scope:=(_kind='ticket' AND r.bound_ticket_id=_id) OR (_kind='order' AND r.bound_order_id=_id);
 -- A valid reference may be used on any ticket or order until it expires; the latest use owns renewals.
 UPDATE enabler_confirm_codes SET used_at=coalesce(used_at,now()),bound_ticket_id=CASE WHEN _kind='ticket' THEN _id ELSE NULL END,bound_order_id=CASE WHEN _kind='order' THEN _id ELSE NULL END WHERE code_hash=_hash;
 IF NOT coalesce(same_scope,false) THEN
  -- Never revive a consumed connection or move a session already linked elsewhere.
  SELECT id INTO sid FROM tv_remote_sessions WHERE id=r.session_id AND status='pending' AND expires_at>now() AND link_id IS NULL AND requested_at IS NULL;
  IF _kind='ticket' THEN UPDATE ticket_remote_setup SET app_checks=r.checks,app_checked_at=now(),pending_session_id=sid,updated_at=now() WHERE ticket_id=_id;
  ELSE UPDATE order_remote_setup SET app_checks=r.checks,app_checked_at=now(),pending_session_id=sid,updated_at=now() WHERE order_id=_id; END IF;
 END IF;
 RETURN CASE WHEN r.kind='install' THEN 'ok_install' ELSE 'ok' END;
END $$;
REVOKE ALL ON FUNCTION public.apply_enabler_confirmation(text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_enabler_confirmation(text,uuid,text) TO service_role;