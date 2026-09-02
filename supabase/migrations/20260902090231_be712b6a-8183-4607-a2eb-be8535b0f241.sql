CREATE OR REPLACE FUNCTION public.prevent_ticket_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
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