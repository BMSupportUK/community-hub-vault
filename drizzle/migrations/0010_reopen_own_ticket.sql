CREATE OR REPLACE FUNCTION public.reopen_own_ticket(_ticket_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t public.tickets;
BEGIN
  SELECT * INTO _t FROM public.tickets WHERE id = _ticket_id;
  IF _t.id IS NULL THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;
  IF _t.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your ticket';
  END IF;
  IF _t.order_id IS NOT NULL THEN
    RAISE EXCEPTION 'Order tickets cannot be reopened';
  END IF;
  UPDATE public.tickets
     SET status = 'open',
         closed_at = NULL,
         archived_at = NULL,
         updated_at = now()
   WHERE id = _ticket_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_own_ticket(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_own_ticket(uuid) TO authenticated;