CREATE OR REPLACE FUNCTION public.prevent_ticket_reassignment()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Deliberate handovers set app.allow_reassign for the transaction.
  IF coalesce(current_setting('app.allow_reassign', true), '') = '1' THEN
    RETURN NEW;
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.reassign_ticket(_ticket_id uuid, _to_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM set_config('app.allow_reassign', '1', true);
  UPDATE public.tickets SET assigned_to = _to_user WHERE id = _ticket_id;
  PERFORM set_config('app.allow_reassign', '0', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.reassign_ticket(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reassign_ticket(uuid, uuid) TO service_role;