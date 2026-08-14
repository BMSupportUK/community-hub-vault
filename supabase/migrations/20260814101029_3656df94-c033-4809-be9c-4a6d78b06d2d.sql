CREATE OR REPLACE FUNCTION public.fan_zone_protected_user_ids()
RETURNS TABLE(user_id uuid, role app_role)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT ur.user_id, ur.role
  FROM public.user_roles ur
  WHERE ur.role IN ('admin'::app_role, 'management'::app_role, 'moderator'::app_role, 'boro_fan_zone_moderator'::app_role)
    AND auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.fan_zone_protected_user_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fan_zone_protected_user_ids() TO authenticated;

CREATE OR REPLACE FUNCTION public.fan_zone_block(_other uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() = _other THEN RAISE EXCEPTION 'Bad request'; END IF;
  IF public.has_any_role(_other, ARRAY['admin','management','moderator','boro_fan_zone_moderator']::app_role[]) THEN
    RAISE EXCEPTION 'PROTECTED_ROLE: admins, management and moderators cannot be blocked';
  END IF;
  INSERT INTO public.fan_zone_blocks (blocker_id, blocked_id)
    VALUES (auth.uid(), _other)
    ON CONFLICT DO NOTHING;
END;
$$;