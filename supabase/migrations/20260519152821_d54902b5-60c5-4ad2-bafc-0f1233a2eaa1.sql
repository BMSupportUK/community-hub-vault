CREATE OR REPLACE FUNCTION public.unmute_user(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _deleted int;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_role(_caller, 'admin')
    OR public.has_role(_caller, 'management')
    OR public.has_role(_caller, 'staff')
    OR public.has_role(_caller, 'moderator')
  ) THEN
    RAISE EXCEPTION 'Not authorised to unmute users' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.chat_mutes
  WHERE user_id = _user_id
    AND expires_at > now();

  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.unmute_user(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.unmute_user(uuid) TO authenticated;