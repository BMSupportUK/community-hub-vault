-- Sweep: advisory lock to prevent overlapping runs, row-level lock per ticket.
CREATE OR REPLACE FUNCTION public.assign_pending_tickets()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ticket_id uuid;
  v_pick uuid;
  v_count integer := 0;
BEGIN
  -- Only one sweep at a time across the cluster. If another run holds the
  -- lock, exit quietly — the in-flight run will handle the queue.
  IF NOT pg_try_advisory_lock(hashtext('assign_pending_tickets')) THEN
    RETURN 0;
  END IF;

  BEGIN
    IF public.is_business_open() IS DISTINCT FROM TRUE THEN
      PERFORM pg_advisory_unlock(hashtext('assign_pending_tickets'));
      RETURN 0;
    END IF;

    FOR v_ticket_id IN
      SELECT id
      FROM public.tickets
      WHERE assigned_to IS NULL
        AND status IN ('open'::public.ticket_status, 'in_progress'::public.ticket_status)
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
    LOOP
      -- Pick the least-loaded eligible on-duty staff member.
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

      EXIT WHEN v_pick IS NULL;

      UPDATE public.tickets
         SET assigned_to = v_pick,
             status = CASE WHEN status = 'open'::public.ticket_status
                           THEN 'in_progress'::public.ticket_status
                           ELSE status END
       WHERE id = v_ticket_id
         AND assigned_to IS NULL; -- final guard against any race

      v_count := v_count + 1;
      v_pick := NULL;
    END LOOP;

    PERFORM pg_advisory_unlock(hashtext('assign_pending_tickets'));
    RETURN v_count;
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(hashtext('assign_pending_tickets'));
    RAISE;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_pending_tickets() FROM PUBLIC;

-- Insert trigger: serialize the "pick least-loaded staff" step so two
-- concurrent inserts can't both read the same stale load counts and pick the
-- same person. The lock is xact-scoped and held only for the pick.
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

  IF public.is_business_open() IS DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent picks for the lifetime of this transaction.
  PERFORM pg_advisory_xact_lock(hashtext('auto_assign_ticket_pick'));

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