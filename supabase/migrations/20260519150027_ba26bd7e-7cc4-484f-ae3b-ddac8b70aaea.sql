CREATE OR REPLACE FUNCTION public.request_ticket_admin_help(_ticket_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ticket public.tickets%ROWTYPE;
  v_requester_name text;
  v_inserted integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Only staff/admin/management/moderator can ping for help.
  IF NOT public.has_any_role(v_uid, ARRAY['admin','management','staff','moderator']::app_role[]) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ticket FROM public.tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  -- Cooldown: skip if the same requester already pinged on this ticket
  -- in the last 5 minutes (avoid spam).
  IF EXISTS (
    SELECT 1 FROM public.user_notifications
    WHERE kind = 'ticket_help_requested'
      AND source_id = _ticket_id
      AND created_at > now() - interval '5 minutes'
      AND body LIKE '%' || v_uid::text || '%'
  ) THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(display_name, username, 'A staff member')
    INTO v_requester_name
  FROM public.profiles
  WHERE id = v_uid;

  INSERT INTO public.user_notifications
    (user_id, kind, title, body, link_path, source_type, source_id)
  SELECT DISTINCT ur.user_id,
         'ticket_help_requested',
         'Help requested on a ticket',
         COALESCE(v_requester_name, 'A staff member')
           || ' needs help with: '
           || COALESCE(v_ticket.subject, 'a ticket')
           || ' [' || v_uid::text || ']',
         '/tickets?id=' || _ticket_id::text,
         'ticket',
         _ticket_id
  FROM public.user_roles ur
  WHERE ur.role IN ('admin'::app_role, 'management'::app_role)
    AND ur.user_id <> v_uid;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.request_ticket_admin_help(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_ticket_admin_help(uuid) TO authenticated;