CREATE OR REPLACE FUNCTION public.redeem_invite(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- NOTE: invite redemption no longer auto-grants the 'member' role.
  -- The user remains pending and must be approved by admin/management in moderation.

  RETURN jsonb_build_object('ok', true, 'pending_approval', true);
END;
$$;