CREATE OR REPLACE FUNCTION public.reset_ticket_remote_setup(_ticket_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tickets WHERE id=_ticket_id AND user_id=auth.uid() AND status <> 'closed') THEN RAISE EXCEPTION 'Only the ticket customer can do this'; END IF;
  DELETE FROM ticket_remote_setup WHERE ticket_id=_ticket_id;
  -- Unlink the reference so the customer types the code their app shows now; it stays valid in the app.
  UPDATE enabler_confirm_codes SET bound_ticket_id = NULL, refresh_state = NULL, refresh_request_id = NULL, refresh_requested_at = NULL
   WHERE bound_ticket_id = _ticket_id;
END $function$;