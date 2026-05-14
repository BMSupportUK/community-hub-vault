CREATE OR REPLACE FUNCTION public.submit_appeal(p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app_id uuid;
  v_ticket bigint;
  v_ref text;
  v_trim text := btrim(coalesce(p_reason, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF length(v_trim) < 10 THEN
    RAISE EXCEPTION 'Appeal must be at least 10 characters';
  END IF;
  IF length(v_trim) > 1000 THEN
    RAISE EXCEPTION 'Appeal must be under 1000 characters';
  END IF;

  INSERT INTO public.gate_applications (user_id, reason)
  VALUES (v_uid, '[APPEAL] ' || v_trim)
  RETURNING id, ticket_number INTO v_app_id, v_ticket;

  v_ref := 'APPEAL-' || lpad(v_ticket::text, 6, '0');

  INSERT INTO public.gate_messages (application_id, sender_id, content)
  VALUES (v_app_id, v_uid, 'Appeal Reference: ' || v_ref || E'\n\n' || v_trim);

  -- Move user out of banned and back to pending so they can chat on /gate
  DELETE FROM public.user_roles WHERE user_id = v_uid AND role = 'banned'::app_role;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'pending'::app_role)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('application_id', v_app_id, 'ticket_number', v_ticket, 'reference', v_ref);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_appeal(text) TO authenticated;