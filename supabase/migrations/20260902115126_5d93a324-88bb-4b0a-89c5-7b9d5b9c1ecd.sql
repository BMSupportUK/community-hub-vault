REVOKE EXECUTE ON FUNCTION public.is_sales_ticket(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.auto_assign_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pick uuid;
  v_roles app_role[];
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_owner_management_category(NEW.category_id) THEN
    RETURN NEW;
  END IF;

  IF public.is_business_open() IS DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.order_id IS NOT NULL THEN
    v_roles := ARRAY['admin'::app_role, 'management'::app_role];
  ELSE
    v_roles := ARRAY['admin'::app_role, 'management'::app_role, 'staff'::app_role];
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('auto_assign_ticket_pick'));

  WITH eligible AS (
    SELECT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = ANY (v_roles)
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
$$;

CREATE OR REPLACE FUNCTION public.assign_pending_tickets()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket record;
  v_pick uuid;
  v_count integer := 0;
  v_updated_id uuid;
  v_roles app_role[];
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
      SELECT id, user_id, subject, order_id, category_id
      FROM public.tickets
      WHERE assigned_to IS NULL
        AND status IN ('open'::public.ticket_status, 'in_progress'::public.ticket_status)
        AND NOT public.is_owner_management_category(category_id)
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
    LOOP
      IF v_ticket.order_id IS NOT NULL THEN
        v_roles := ARRAY['admin'::app_role, 'management'::app_role];
      ELSE
        v_roles := ARRAY['admin'::app_role, 'management'::app_role, 'staff'::app_role];
      END IF;

      v_pick := NULL;

      WITH eligible AS (
        SELECT ur.user_id
        FROM public.user_roles ur
        WHERE ur.role = ANY (v_roles)
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

      CONTINUE WHEN v_pick IS NULL;

      UPDATE public.tickets
         SET assigned_to = v_pick,
             status = CASE WHEN status = 'open'::public.ticket_status
                           THEN 'in_progress'::public.ticket_status
                           ELSE status END
       WHERE id = v_ticket.id
         AND assigned_to IS NULL
      RETURNING id INTO v_updated_id;

      IF v_updated_id IS NOT NULL THEN
        IF v_ticket.user_id IS DISTINCT FROM v_pick THEN
          INSERT INTO public.user_notifications
            (user_id, kind, title, body, link_path, source_type, source_id)
          VALUES (
            v_ticket.user_id,
            'ticket_assigned',
            'Your ticket has been picked up',
            COALESCE(v_ticket.subject, 'Ticket') || ' is now being handled by the team.',
            '/tickets?id=' || v_ticket.id::text,
            'ticket',
            v_ticket.id
          );
        END IF;
        v_count := v_count + 1;
      END IF;
    END LOOP;

    PERFORM pg_advisory_unlock(hashtext('assign_pending_tickets'));
    RETURN v_count;
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(hashtext('assign_pending_tickets'));
    RAISE;
  END;
END;
$$;