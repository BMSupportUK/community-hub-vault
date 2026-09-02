CREATE OR REPLACE FUNCTION public.is_sales_ticket(_ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = _ticket_id
      AND (t.order_id IS NOT NULL OR public.is_owner_management_category(t.category_id))
  )
$$;

DROP POLICY IF EXISTS "tickets read own or staff" ON public.tickets;
CREATE POLICY "tickets read own or staff" ON public.tickets
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])
  OR (
    has_any_role(auth.uid(), ARRAY['staff'::app_role, 'moderator'::app_role])
    AND NOT is_owner_management_category(category_id)
    AND order_id IS NULL
  )
);

DROP POLICY IF EXISTS "tickets update staff" ON public.tickets;
CREATE POLICY "tickets update staff" ON public.tickets
FOR UPDATE TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])
  OR (
    has_any_role(auth.uid(), ARRAY['staff'::app_role, 'moderator'::app_role])
    AND NOT is_owner_management_category(category_id)
    AND order_id IS NULL
  )
)
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])
  OR (
    has_any_role(auth.uid(), ARRAY['staff'::app_role, 'moderator'::app_role])
    AND NOT is_owner_management_category(category_id)
    AND order_id IS NULL
  )
);

DROP POLICY IF EXISTS "tmsg read participants" ON public.ticket_messages;
CREATE POLICY "tmsg read participants" ON public.ticket_messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ticket_messages.ticket_id
      AND (
        (t.user_id = auth.uid() AND ticket_messages.is_internal = false)
        OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])
        OR (
          has_any_role(auth.uid(), ARRAY['staff'::app_role, 'moderator'::app_role])
          AND NOT is_owner_management_category(t.category_id)
          AND t.order_id IS NULL
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
        (t.user_id = auth.uid() AND ticket_messages.is_internal = false)
        OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])
        OR (
          has_any_role(auth.uid(), ARRAY['staff'::app_role, 'moderator'::app_role])
          AND NOT is_owner_management_category(t.category_id)
          AND t.order_id IS NULL
        )
      )
  )
);

DROP POLICY IF EXISTS "tmsg update author or admin" ON public.ticket_messages;
CREATE POLICY "tmsg update author or admin" ON public.ticket_messages
FOR UPDATE TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])
  OR (sender_id = auth.uid() AND NOT public.is_sales_ticket(ticket_id))
)
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])
  OR (sender_id = auth.uid() AND NOT public.is_sales_ticket(ticket_id))
);