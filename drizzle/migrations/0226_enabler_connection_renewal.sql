ALTER TABLE public.enabler_confirm_codes ADD COLUMN refresh_token_hash text;
ALTER TABLE public.enabler_confirm_codes ADD COLUMN refresh_request_id uuid;
ALTER TABLE public.enabler_confirm_codes ADD COLUMN refresh_state text;
ALTER TABLE public.enabler_confirm_codes ADD COLUMN refresh_requested_at timestamptz;
CREATE OR REPLACE FUNCTION public.request_enabler_connection(_kind text,_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.enabler_confirm_codes; s public.tv_remote_sessions;
BEGIN
 IF _kind NOT IN ('ticket','order') THEN RETURN 'invalid'; END IF;
 SELECT * INTO r FROM enabler_confirm_codes WHERE expires_at>now() AND ((_kind='ticket' AND bound_ticket_id=_id) OR (_kind='order' AND bound_order_id=_id)) ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
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
CREATE OR REPLACE FUNCTION public.request_ticket_enabler_connection(_ticket_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM tickets WHERE id=_ticket_id AND user_id=auth.uid() AND status<>'closed') THEN RAISE EXCEPTION 'Only the ticket customer can do this'; END IF;
 RETURN public.request_enabler_connection('ticket',_ticket_id);
END $$;
REVOKE ALL ON FUNCTION public.request_ticket_enabler_connection(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_ticket_enabler_connection(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.enabler_refresh_task(_token_hash text,_request_id uuid DEFAULT NULL,_helper_hash text DEFAULT NULL,_checks jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.enabler_confirm_codes; s public.tv_remote_sessions; kind text; scope uuid;
BEGIN
 SELECT * INTO r FROM enabler_confirm_codes WHERE refresh_token_hash=_token_hash AND expires_at>now() FOR UPDATE;
 IF r.code_hash IS NULL THEN RETURN jsonb_build_object('state','expired'); END IF;
 kind:=CASE WHEN r.bound_ticket_id IS NOT NULL THEN 'ticket' WHEN r.bound_order_id IS NOT NULL THEN 'order' END;
 scope:=coalesce(r.bound_ticket_id,r.bound_order_id);
 IF scope IS NULL THEN RETURN jsonb_build_object('state','idle'); END IF;
 IF kind='ticket' AND NOT EXISTS(SELECT 1 FROM tickets WHERE id=scope AND status<>'closed') THEN RETURN jsonb_build_object('state','closed'); END IF;
 SELECT * INTO s FROM tv_remote_sessions WHERE id=r.session_id FOR UPDATE;
 IF s.id IS NOT NULL AND s.expires_at>now() AND s.status IN ('claimed','active') THEN RETURN jsonb_build_object('state','in_progress'); END IF;
 IF s.id IS NOT NULL AND s.status='pending' AND s.expires_at>now() AND s.link_id IS NOT NULL THEN RETURN jsonb_build_object('state','in_progress'); END IF;
 IF _request_id IS NULL THEN
  IF r.refresh_state<>'queued' OR r.refresh_requested_at<now()-interval '3 minutes' THEN RETURN jsonb_build_object('state','idle'); END IF;
  UPDATE enabler_confirm_codes SET refresh_state='processing' WHERE code_hash=r.code_hash;
  RETURN jsonb_build_object('state','refresh','requestId',r.refresh_request_id);
 END IF;
 IF r.refresh_request_id IS DISTINCT FROM _request_id OR r.refresh_state NOT IN ('processing','done') THEN RETURN jsonb_build_object('state','stale'); END IF;
 IF r.refresh_state='done' THEN RETURN jsonb_build_object('state','done'); END IF;
 IF _helper_hash IS NULL THEN UPDATE enabler_confirm_codes SET refresh_state='failed' WHERE code_hash=r.code_hash; RETURN jsonb_build_object('state','failed'); END IF;
 IF NOT (coalesce((_checks->>'adb')::boolean,false) AND coalesce((_checks->>'helper')::boolean,false) AND coalesce((_checks->>'control')::boolean,false) AND coalesce((_checks->>'accessibility')::boolean,false)) THEN RETURN jsonb_build_object('state','failed'); END IF;
 SELECT * INTO s FROM tv_remote_sessions WHERE code_hash=_helper_hash AND status='pending' AND expires_at>now() AND link_id IS NULL AND id IS DISTINCT FROM r.session_id FOR UPDATE;
 IF s.id IS NULL THEN UPDATE enabler_confirm_codes SET refresh_state='failed' WHERE code_hash=r.code_hash; RETURN jsonb_build_object('state','failed'); END IF;
 UPDATE enabler_confirm_codes SET session_id=s.id,checks=_checks,refresh_state='done' WHERE code_hash=r.code_hash;
 IF kind='ticket' THEN UPDATE ticket_remote_setup SET app_checks=_checks,app_checked_at=now(),checks_used_at=NULL,pending_session_id=s.id,updated_at=now() WHERE ticket_id=scope AND device=r.device;
 ELSE UPDATE order_remote_setup SET app_checks=_checks,app_checked_at=now(),checks_used_at=NULL,pending_session_id=s.id,updated_at=now() WHERE order_id=scope AND device=r.device; END IF;
 RETURN jsonb_build_object('state','done');
END $$;
REVOKE ALL ON FUNCTION public.enabler_refresh_task(text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enabler_refresh_task(text,uuid,text,jsonb) TO service_role;