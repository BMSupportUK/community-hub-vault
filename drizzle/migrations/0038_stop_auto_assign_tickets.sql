CREATE OR REPLACE FUNCTION public.auto_assign_ticket()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- Auto-assignment retired: staff now claim tickets themselves.
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_pending_tickets()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- Auto-assignment retired: staff now claim tickets themselves.
  RETURN 0;
END;
$function$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'assign-pending-tickets') THEN
    PERFORM cron.unschedule('assign-pending-tickets');
  END IF;
END $$;