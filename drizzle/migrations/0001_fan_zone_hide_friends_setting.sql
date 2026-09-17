ALTER TABLE public.fan_zone_members
  ADD COLUMN IF NOT EXISTS hide_friends boolean NOT NULL DEFAULT false;

-- Own-row setter: members cannot UPDATE fan_zone_members directly (admin-only policy),
-- so expose a narrow security-definer setter for just this preference.
CREATE OR REPLACE FUNCTION public.fan_zone_set_hide_friends(_hide boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  UPDATE public.fan_zone_members
     SET hide_friends = coalesce(_hide, false)
   WHERE user_id = auth.uid();
  RETURN coalesce(_hide, false);
END;
$$;

REVOKE ALL ON FUNCTION public.fan_zone_set_hide_friends(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fan_zone_set_hide_friends(boolean) TO authenticated;

-- Safe read of the flag for other members' profiles (no other columns exposed).
CREATE OR REPLACE FUNCTION public.fan_zone_hide_friends(_ids uuid[])
RETURNS TABLE (user_id uuid, hide_friends boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.user_id, m.hide_friends
    FROM public.fan_zone_members m
   WHERE m.user_id = ANY(_ids)
$$;

REVOKE ALL ON FUNCTION public.fan_zone_hide_friends(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fan_zone_hide_friends(uuid[]) TO authenticated;