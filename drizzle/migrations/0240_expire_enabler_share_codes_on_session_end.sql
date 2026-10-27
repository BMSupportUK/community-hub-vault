CREATE OR REPLACE FUNCTION public.expire_enabler_codes_on_share_end()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL AND NEW.link_id IS NOT NULL THEN
  IF NEW.link_kind='ticket' THEN
   UPDATE public.enabler_confirm_codes SET expires_at=least(expires_at,now()), refresh_state=NULL, refresh_request_id=NULL, refresh_requested_at=NULL
    WHERE bound_ticket_id=NEW.link_id AND kind='share' AND expires_at>now();
   DELETE FROM public.ticket_remote_setup WHERE ticket_id=NEW.link_id;
  ELSIF NEW.link_kind='order' THEN
   UPDATE public.enabler_confirm_codes SET expires_at=least(expires_at,now()), refresh_state=NULL, refresh_request_id=NULL, refresh_requested_at=NULL
    WHERE bound_order_id=NEW.link_id AND kind='share' AND expires_at>now();
   DELETE FROM public.order_remote_setup WHERE order_id=NEW.link_id;
  END IF;
 END IF;
 RETURN NEW;
END $function$;
REVOKE EXECUTE ON FUNCTION public.expire_enabler_codes_on_share_end() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS expire_enabler_codes_share_end ON public.tv_remote_sessions;
CREATE TRIGGER expire_enabler_codes_share_end AFTER UPDATE OF ended_at ON public.tv_remote_sessions FOR EACH ROW EXECUTE FUNCTION public.expire_enabler_codes_on_share_end();