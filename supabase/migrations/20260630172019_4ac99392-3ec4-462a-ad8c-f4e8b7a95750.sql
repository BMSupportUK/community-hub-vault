CREATE OR REPLACE FUNCTION public.redeem_invite(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_invite RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_invite
  FROM public.invites
  WHERE code = p_code
  LIMIT 1;

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  IF v_invite.used_by IS NOT NULL THEN
    RAISE EXCEPTION 'This invite has already been used';
  END IF;

  IF v_invite.created_by = v_uid THEN
    RAISE EXCEPTION 'You cannot redeem your own invite';
  END IF;

  UPDATE public.invites
  SET used_by = v_uid, used_at = now()
  WHERE id = v_invite.id;

  -- Auto-approve invited users with the nonsubscriber role.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'nonsubscriber')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'pending_approval', false, 'granted_role', 'nonsubscriber');
END;
$function$;