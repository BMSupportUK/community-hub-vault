CREATE OR REPLACE FUNCTION public.claim_invite_access()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.invites WHERE used_by = v_uid) THEN
    RETURN false;
  END IF;
  -- Banned / rejected accounts are never re-opened by an invite.
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role IN ('banned','rejected')) THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role <> 'pending') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'nonsubscriber')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_invite_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_invite_access() TO authenticated;