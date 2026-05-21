
-- 1. Add the new category
INSERT INTO public.ticket_categories (name, slug, description, icon, color, sort_order)
VALUES ('Contact Owner & Management', 'owner-management', 'Private message to ownership and management only', 'ShieldCheck', 'warning', -20)
ON CONFLICT (slug) DO NOTHING;

-- 2. Helper to check if a category is the owner-management one
CREATE OR REPLACE FUNCTION public.is_owner_management_category(_category_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ticket_categories
    WHERE id = _category_id AND slug = 'owner-management'
  )
$$;

-- 3. Replace tickets RLS read/update policies to exclude staff/moderator from owner-management
DROP POLICY IF EXISTS "tickets read own or staff" ON public.tickets;
CREATE POLICY "tickets read own or staff" ON public.tickets
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])
  OR (
    has_any_role(auth.uid(), ARRAY['staff'::app_role, 'moderator'::app_role])
    AND NOT public.is_owner_management_category(category_id)
  )
);

DROP POLICY IF EXISTS "tickets update staff" ON public.tickets;
CREATE POLICY "tickets update staff" ON public.tickets
FOR UPDATE TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])
  OR (
    has_any_role(auth.uid(), ARRAY['staff'::app_role, 'moderator'::app_role])
    AND NOT public.is_owner_management_category(category_id)
  )
)
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])
  OR (
    has_any_role(auth.uid(), ARRAY['staff'::app_role, 'moderator'::app_role])
    AND NOT public.is_owner_management_category(category_id)
  )
);

-- 4. Replace ticket_messages RLS to mirror the same scoping
DROP POLICY IF EXISTS "tmsg read participants" ON public.ticket_messages;
CREATE POLICY "tmsg read participants" ON public.ticket_messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ticket_messages.ticket_id
      AND (
        (t.user_id = auth.uid() AND is_internal = false)
        OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])
        OR (
          has_any_role(auth.uid(), ARRAY['staff'::app_role, 'moderator'::app_role])
          AND NOT public.is_owner_management_category(t.category_id)
        )
      )
  )
);

DROP POLICY IF EXISTS "tmsg insert participants" ON public.ticket_messages;
CREATE POLICY "tmsg insert participants" ON public.ticket_messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ticket_messages.ticket_id
      AND (
        (t.user_id = auth.uid() AND is_internal = false)
        OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])
        OR (
          has_any_role(auth.uid(), ARRAY['staff'::app_role, 'moderator'::app_role])
          AND NOT public.is_owner_management_category(t.category_id)
        )
      )
  )
);

-- 5. Skip auto-assignment for owner-management tickets
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

  IF public.is_owner_management_category(NEW.category_id) THEN
    RETURN NEW;
  END IF;

  IF public.is_business_open() IS DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;

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

-- 6. notify_ticket_raised: emit a private kind for owner-management so only admin/management see it
CREATE OR REPLACE FUNCTION public.notify_ticket_raised()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_username text;
  v_is_owner boolean;
BEGIN
  SELECT COALESCE(display_name, username, 'A user') INTO v_username
    FROM public.profiles WHERE id = NEW.user_id;
  v_is_owner := public.is_owner_management_category(NEW.category_id);
  INSERT INTO public.staff_notifications (kind, title, body, link_path, entity_id)
  VALUES (
    CASE WHEN v_is_owner THEN 'ticket_raised_owner' ELSE 'ticket_raised' END,
    CASE WHEN v_is_owner THEN 'Private message to owner/management: ' ELSE 'New support ticket: ' END || NEW.subject,
    COALESCE(v_username, 'A user') || ' raised a ' || NEW.priority::text || ' priority ticket needing assistance.',
    '/tickets',
    NEW.id
  );
  RETURN NEW;
END;
$function$;

-- 7. Update staff_notifications read policy to route 'ticket_raised_owner' to admin/management only
DROP POLICY IF EXISTS "notif read staff" ON public.staff_notifications;
CREATE POLICY "notif read staff" ON public.staff_notifications
FOR SELECT TO authenticated
USING (
  CASE
    WHEN kind = ANY (ARRAY['gate_application'::text, 'order_placed'::text, 'holiday_request'::text, 'shift_swap'::text, 'ticket_raised_owner'::text])
      THEN has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])
    ELSE has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role, 'moderator'::app_role, 'staff'::app_role])
  END
);
