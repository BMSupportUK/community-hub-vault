CREATE OR REPLACE FUNCTION public.prevent_ticket_reassignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Block direct overwrite of an existing assignee with a different one.
  -- To reassign legitimately, first set assigned_to = NULL, then set the new user.
  IF OLD.assigned_to IS NOT NULL
     AND NEW.assigned_to IS NOT NULL
     AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    RAISE EXCEPTION
      'Ticket % is already assigned. Unassign it first before assigning to a different staff member.',
      OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_ticket_reassignment_trg ON public.tickets;

CREATE TRIGGER prevent_ticket_reassignment_trg
BEFORE UPDATE OF assigned_to ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.prevent_ticket_reassignment();