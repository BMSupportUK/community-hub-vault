CREATE OR REPLACE FUNCTION public.reset_ticket_remote_setup(_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tickets WHERE id=_ticket_id AND user_id=auth.uid() AND status <> 'closed') THEN RAISE EXCEPTION 'Only the ticket customer can do this'; END IF;
  DELETE FROM ticket_remote_setup WHERE ticket_id=_ticket_id;
END $function$;
GRANT EXECUTE ON FUNCTION public.reset_ticket_remote_setup(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_ticket_remote_setup(uuid) FROM anon;