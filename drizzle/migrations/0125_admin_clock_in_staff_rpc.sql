CREATE OR REPLACE FUNCTION public.admin_clock_in_staff(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shift_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','management','staff','moderator')
  ) THEN
    RAISE EXCEPTION 'target is not a staff member';
  END IF;
  IF EXISTS (SELECT 1 FROM public.shifts WHERE user_id = _user_id AND clock_out IS NULL) THEN
    RAISE EXCEPTION 'already on shift';
  END IF;
  INSERT INTO public.shifts (user_id) VALUES (_user_id) RETURNING id INTO _shift_id;
  RETURN _shift_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_clock_in_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_clock_in_staff(uuid) TO authenticated;