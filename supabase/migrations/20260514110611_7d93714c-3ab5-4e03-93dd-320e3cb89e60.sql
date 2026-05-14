CREATE OR REPLACE FUNCTION public.submit_appeal(p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_app_id uuid;
  v_ticket bigint;
  v_ref text;
  v_trim text := btrim(coalesce(p_reason, ''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF length(v_trim) < 10 THEN RAISE EXCEPTION 'Appeal must be at least 10 characters'; END IF;
  IF length(v_trim) > 1000 THEN RAISE EXCEPTION 'Appeal must be under 1000 characters'; END IF;

  SELECT id, ticket_number INTO v_app_id, v_ticket
  FROM public.gate_applications WHERE user_id = v_uid;

  IF v_app_id IS NULL THEN
    INSERT INTO public.gate_applications (user_id, reason, status)
    VALUES (v_uid, '[APPEAL] ' || v_trim, 'pending')
    RETURNING id, ticket_number INTO v_app_id, v_ticket;
  ELSE
    UPDATE public.gate_applications
    SET reason = '[APPEAL] ' || v_trim,
        status = 'pending',
        reviewed_at = NULL,
        reviewed_by = NULL
    WHERE id = v_app_id;
  END IF;

  v_ref := 'APPEAL-' || lpad(v_ticket::text, 6, '0');

  -- Remove any previous automated appeal messages from this user on this application
  DELETE FROM public.gate_messages
  WHERE application_id = v_app_id
    AND sender_id = v_uid
    AND content LIKE 'Appeal Reference:%';

  INSERT INTO public.gate_messages (application_id, sender_id, content)
  VALUES (v_app_id, v_uid, 'Appeal Reference: ' || v_ref || E'\n\n' || v_trim);

  DELETE FROM public.user_roles WHERE user_id = v_uid AND role = 'banned'::app_role;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'pending'::app_role)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('application_id', v_app_id, 'ticket_number', v_ticket, 'reference', v_ref);
END;
$function$;