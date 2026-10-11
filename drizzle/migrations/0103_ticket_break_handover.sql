CREATE OR REPLACE FUNCTION public.handover_tickets_for_break(_kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_t record;
  v_pick uuid;
  v_roles app_role[];
  v_label text := CASE WHEN _kind = 'lunch' THEN 'lunch' ELSE 'a break' END;
  v_passed int := 0;
  v_kept int := 0;
BEGIN
  IF v_me IS NULL OR NOT public.has_any_role(v_me, ARRAY['admin','management','staff','moderator']::app_role[]) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  FOR v_t IN
    SELECT id, subject, order_id FROM public.tickets
    WHERE assigned_to = v_me AND status IN ('open','in_progress') AND archived_at IS NULL
    FOR UPDATE
  LOOP
    v_roles := CASE WHEN v_t.order_id IS NOT NULL
      THEN ARRAY['admin','management']::app_role[]
      ELSE ARRAY['admin','management','staff']::app_role[] END;
    v_pick := NULL;
    SELECT ur.user_id INTO v_pick
    FROM public.user_roles ur
    WHERE ur.role = ANY (v_roles) AND ur.user_id <> v_me
      AND EXISTS (SELECT 1 FROM public.shifts s WHERE s.user_id = ur.user_id AND s.clock_out IS NULL AND s.clock_in <= now())
      AND NOT EXISTS (SELECT 1 FROM public.breaks b JOIN public.shifts s2 ON s2.id = b.shift_id
                      WHERE b.user_id = ur.user_id AND b.ended_at IS NULL AND s2.clock_out IS NULL)
    GROUP BY ur.user_id
    ORDER BY (SELECT COUNT(*) FROM public.tickets t WHERE t.assigned_to = ur.user_id AND t.status IN ('open','in_progress')) ASC, random()
    LIMIT 1;

    IF v_pick IS NULL THEN
      v_kept := v_kept + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.ticket_messages (ticket_id, sender_id, content)
    VALUES (v_t.id, v_me, 'I''m currently taking ' || v_label || ' and will pass this ticket to another member of staff, who will take over shortly.');

    UPDATE public.tickets SET assigned_to = v_pick, updated_at = now() WHERE id = v_t.id;

    INSERT INTO public.user_notifications (user_id, kind, title, body, link_path, source_type, source_id)
    VALUES (v_pick, 'ticket_assigned', 'Ticket passed to you',
            COALESCE(v_t.subject, 'Ticket') || ' — a colleague has gone on ' || v_label || '. Please take control of this ticket.',
            '/tickets?id=' || v_t.id::text, 'ticket', v_t.id);
    v_passed := v_passed + 1;
  END LOOP;

  RETURN jsonb_build_object('passed', v_passed, 'kept', v_kept);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handover_tickets_for_break(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.handover_tickets_for_break(text) TO authenticated;