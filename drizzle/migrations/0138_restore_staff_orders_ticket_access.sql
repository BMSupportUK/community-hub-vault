CREATE OR REPLACE FUNCTION public.staff_ticket_scope_allowed(_category_id uuid, _order_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _order_id IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.ticket_categories c
    WHERE c.id = _category_id AND c.slug = 'owner-management'
  );
$$;
REVOKE ALL ON FUNCTION public.staff_ticket_scope_allowed(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_ticket_scope_allowed(uuid, uuid) TO authenticated, service_role;

ALTER POLICY "tickets read own or staff" ON public.tickets USING (
  user_id = auth.uid()
  OR public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[])
  OR (public.has_any_role(auth.uid(), ARRAY['staff','moderator']::public.app_role[])
      AND public.staff_ticket_scope_allowed(category_id, order_id))
);
ALTER POLICY "tickets update staff" ON public.tickets USING (
  public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[])
  OR (public.has_any_role(auth.uid(), ARRAY['staff','moderator']::public.app_role[])
      AND public.staff_ticket_scope_allowed(category_id, order_id))
) WITH CHECK (
  public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[])
  OR (public.has_any_role(auth.uid(), ARRAY['staff','moderator']::public.app_role[])
      AND public.staff_ticket_scope_allowed(category_id, order_id))
);
ALTER POLICY "tmsg read participants" ON public.ticket_messages USING (
  EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_messages.ticket_id AND (
    (t.user_id = auth.uid() AND ticket_messages.is_internal = false)
    OR public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[])
    OR (public.has_any_role(auth.uid(), ARRAY['staff','moderator']::public.app_role[])
        AND public.staff_ticket_scope_allowed(t.category_id, t.order_id))
  ))
);
ALTER POLICY "tmsg insert participants" ON public.ticket_messages WITH CHECK (
  sender_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.tickets t WHERE t.id = ticket_messages.ticket_id AND (
      (t.user_id = auth.uid() AND ticket_messages.is_internal = false)
      OR public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[])
      OR (public.has_any_role(auth.uid(), ARRAY['staff','moderator']::public.app_role[])
          AND public.staff_ticket_scope_allowed(t.category_id, t.order_id))
    )
  )
);