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
  v_updated_id uuid;
BEGIN
  IF NOT pg_try_advisory_lock(hashtext('assign_pending_tickets')) THEN
    RETURN 0;
  END IF;

  BEGIN
    IF public.is_business_open() IS DISTINCT FROM TRUE THEN
      PERFORM pg_advisory_unlock(hashtext('assign_pending_tickets'));
      RETURN 0;
    END IF;

    FOR v_ticket IN
      SELECT id, user_id, subject
      FROM public.tickets
      WHERE assigned_to IS NULL
        AND status IN ('open'::public.ticket_status, 'in_progress'::public.ticket_status)
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
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

      EXIT WHEN v_pick IS NULL;

      UPDATE public.tickets
         SET assigned_to = v_pick,
             status = CASE WHEN status = 'open'::public.ticket_status
                           THEN 'in_progress'::public.ticket_status
                           ELSE status END
       WHERE id = v_ticket.id
         AND assigned_to IS NULL
      RETURNING id INTO v_updated_id;

      IF v_updated_id IS NOT NULL THEN
        -- Notify the ticket creator that their overnight ticket is now picked up.
        -- Skip if creator is the same as the assignee.
        IF v_ticket.user_id IS DISTINCT FROM v_pick THEN
          INSERT INTO public.user_notifications
            (user_id, kind, title, body, link_path, source_type, source_id)
          VALUES (
            v_ticket.user_id,
            'ticket_picked_up',
            'Your ticket has been assigned',
            'A staff member is now handling: ' || COALESCE(v_ticket.subject, 'your ticket') || '.',
            '/tickets?id=' || v_ticket.id::text,
            'ticket',
            v_ticket.id
          );
        END IF;

        v_count := v_count + 1;
      END IF;

      v_pick := NULL;
      v_updated_id := NULL;
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