CREATE OR REPLACE FUNCTION public.apply_enabler_confirmation(_kind text, _id uuid, _hash text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
 -- Each reference belongs to one ticket or order: once used it can never move to another.
 IF r.used_at IS NOT NULL AND NOT coalesce(same_scope,false) THEN RETURN 'used_elsewhere'; END IF;
 UPDATE enabler_confirm_codes SET used_at=coalesce(used_at,now()),bound_ticket_id=CASE WHEN _kind='ticket' THEN _id ELSE NULL END,bound_order_id=CASE WHEN _kind='order' THEN _id ELSE NULL END WHERE code_hash=_hash;
 IF NOT coalesce(same_scope,false) THEN
  SELECT id INTO sid FROM tv_remote_sessions WHERE id=r.session_id AND status='pending' AND expires_at>now() AND link_id IS NULL AND requested_at IS NULL;
  IF _kind='ticket' THEN UPDATE ticket_remote_setup SET app_checks=r.checks,app_checked_at=now(),pending_session_id=sid,updated_at=now() WHERE ticket_id=_id;
  ELSE UPDATE order_remote_setup SET app_checks=r.checks,app_checked_at=now(),pending_session_id=sid,updated_at=now() WHERE order_id=_id; END IF;
 END IF;
 RETURN CASE WHEN r.kind='install' THEN 'ok_install' ELSE 'ok' END;
END $function$;

CREATE OR REPLACE FUNCTION public.expire_enabler_codes_on_close()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF TG_TABLE_NAME='tickets' THEN
  IF NEW.status::text='closed' AND OLD.status IS DISTINCT FROM NEW.status THEN
   UPDATE public.enabler_confirm_codes SET expires_at=least(expires_at,now()), refresh_state=NULL WHERE bound_ticket_id=NEW.id AND expires_at>now();
  END IF;
 ELSIF NEW.status::text IN ('completed','cancelled') AND OLD.status IS DISTINCT FROM NEW.status THEN
  UPDATE public.enabler_confirm_codes SET expires_at=least(expires_at,now()), refresh_state=NULL WHERE bound_order_id=NEW.id AND expires_at>now();
 END IF;
 RETURN NEW;
END $function$;
REVOKE EXECUTE ON FUNCTION public.expire_enabler_codes_on_close() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS expire_enabler_codes_ticket_close ON public.tickets;
CREATE TRIGGER expire_enabler_codes_ticket_close AFTER UPDATE OF status ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.expire_enabler_codes_on_close();
DROP TRIGGER IF EXISTS expire_enabler_codes_order_close ON private.orders;
CREATE TRIGGER expire_enabler_codes_order_close AFTER UPDATE OF status ON private.orders FOR EACH ROW EXECUTE FUNCTION public.expire_enabler_codes_on_close();