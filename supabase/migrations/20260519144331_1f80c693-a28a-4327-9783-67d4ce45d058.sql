-- Auto-assign new tickets to an available staff member.
CREATE OR REPLACE FUNCTION public.auto_assign_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pick uuid;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Pick the eligible staff member with the fewest active tickets.
  -- Eligibility: has role admin/management/staff, currently clocked in
  -- (shift open), and not on an active break.
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
$$;

DROP TRIGGER IF EXISTS auto_assign_ticket_trg ON public.tickets;
CREATE TRIGGER auto_assign_ticket_trg
BEFORE INSERT ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_ticket();


-- Notify the assigned staff member whenever assigned_to is set or changed.
CREATE OR REPLACE FUNCTION public.notify_ticket_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigner_name text;
  v_label text;
BEGIN
  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to THEN
    RETURN NEW;
  END IF;

  -- Don't notify the person who assigned the ticket to themselves.
  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.assigned_to THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.assigned_to = NEW.user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_notifications (user_id, kind, title, body, link_path, source_type, source_id)
  VALUES (
    NEW.assigned_to,
    'ticket_assigned',
    'Ticket assigned to you',
    COALESCE(NEW.subject, 'A support ticket was assigned to you.'),
    '/tickets?id=' || NEW.id::text,
    'ticket',
    NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_ticket_assignee_trg ON public.tickets;
CREATE TRIGGER notify_ticket_assignee_trg
AFTER INSERT OR UPDATE OF assigned_to ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.notify_ticket_assignee();


-- Ensure realtime is enabled for user_notifications so the dialog can react instantly.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications';
  END IF;
END $$;