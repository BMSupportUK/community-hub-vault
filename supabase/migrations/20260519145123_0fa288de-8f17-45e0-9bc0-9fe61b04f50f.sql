-- Skip auto-assignment when business is closed; tickets stay unassigned
-- until the next business day, when a scheduled job sweeps and assigns them.
CREATE OR REPLACE FUNCTION public.auto_assign_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pick uuid;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Outside business hours: leave unassigned. The sweep job will pick it up
  -- when the next business day starts.
  IF public.is_business_open() IS DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;

  WITH eligible AS (
    SELECT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN ('admin'::app_role, 'management'::app_role, 'staff'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.shifts s
        WHERE s.user_id = ur.user_id
          AND s.clock_in <= now()
          AND s.clock_out IS NULL
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.breaks b
        JOIN public.shifts s2 ON s2.id = b.shift_id
        WHERE b.user_id = ur.user_id
          AND b.ended_at IS NULL
          AND s2.clock_out IS NULL
      )
    GROUP BY ur.user_id
  ),
  load AS (
    SELECT e.user_id,
           COALESCE((
             SELECT COUNT(*) FROM public.tickets t
             WHERE t.assigned_to = e.user_id
               AND t.status IN ('open'::public.ticket_status, 'in_progress'::public.ticket_status)
           ), 0) AS active_count
    FROM eligible e
  )
  SELECT user_id INTO v_pick
  FROM load
  ORDER BY active_count ASC, random()
  LIMIT 1;

  IF v_pick IS NOT NULL THEN
    NEW.assigned_to := v_pick;
    IF NEW.status = 'open'::public.ticket_status THEN
      NEW.status := 'in_progress'::public.ticket_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Sweep function: when business is open, assign any open/unassigned tickets
-- to eligible on-duty staff (round-robin by lowest active load).
CREATE OR REPLACE FUNCTION public.assign_pending_tickets()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ticket record;
  v_pick uuid;
  v_count integer := 0;
BEGIN
  IF public.is_business_open() IS DISTINCT FROM TRUE THEN
    RETURN 0;
  END IF;

  FOR v_ticket IN
    SELECT id, status
    FROM public.tickets
    WHERE assigned_to IS NULL
      AND status IN ('open'::public.ticket_status, 'in_progress'::public.ticket_status)
    ORDER BY created_at ASC
  LOOP
    WITH eligible AS (
      SELECT ur.user_id
      FROM public.user_roles ur
      WHERE ur.role IN ('admin'::app_role, 'management'::app_role, 'staff'::app_role)
        AND EXISTS (
          SELECT 1 FROM public.shifts s
          WHERE s.user_id = ur.user_id
            AND s.clock_in <= now()
            AND s.clock_out IS NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.breaks b
          JOIN public.shifts s2 ON s2.id = b.shift_id
          WHERE b.user_id = ur.user_id
            AND b.ended_at IS NULL
            AND s2.clock_out IS NULL
        )
      GROUP BY ur.user_id
    ),
    load AS (
      SELECT e.user_id,
             COALESCE((
               SELECT COUNT(*) FROM public.tickets t
               WHERE t.assigned_to = e.user_id
                 AND t.status IN ('open'::public.ticket_status, 'in_progress'::public.ticket_status)
             ), 0) AS active_count
      FROM eligible e
    )
    SELECT user_id INTO v_pick
    FROM load
    ORDER BY active_count ASC, random()
    LIMIT 1;

    EXIT WHEN v_pick IS NULL; -- no one on duty; stop trying this run

    UPDATE public.tickets
       SET assigned_to = v_pick,
           status = CASE WHEN status = 'open'::public.ticket_status
                         THEN 'in_progress'::public.ticket_status
                         ELSE status END
     WHERE id = v_ticket.id;

    v_count := v_count + 1;
    v_pick := NULL;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_pending_tickets() FROM PUBLIC;

-- Schedule sweep every 5 minutes. SQL-only, no HTTP needed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('assign-pending-tickets')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'assign-pending-tickets');
    PERFORM cron.schedule(
      'assign-pending-tickets',
      '*/5 * * * *',
      $cron$ SELECT public.assign_pending_tickets(); $cron$
    );
  END IF;
END
$$;