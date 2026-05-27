
ALTER TABLE public.fan_zone_members
  ADD COLUMN IF NOT EXISTS fan_alias text,
  ADD COLUMN IF NOT EXISTS fan_avatar_url text;

CREATE OR REPLACE FUNCTION public.set_my_fan_alias(_alias text, _avatar text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _alias IS NOT NULL AND char_length(_alias) > 64 THEN
    RAISE EXCEPTION 'Alias too long (max 64 characters)';
  END IF;
  IF _avatar IS NOT NULL AND char_length(_avatar) > 2048 THEN
    RAISE EXCEPTION 'Avatar URL too long';
  END IF;
  UPDATE public.fan_zone_members
    SET fan_alias = NULLIF(btrim(_alias), ''),
        fan_avatar_url = NULLIF(btrim(_avatar), '')
    WHERE user_id = auth.uid()
      AND status = 'approved';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not an approved Boro Fan Zone member';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_fan_alias(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fan_zone_aliases(_ids uuid[])
RETURNS TABLE(user_id uuid, fan_alias text, fan_avatar_url text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT m.user_id, m.fan_alias, m.fan_avatar_url
  FROM public.fan_zone_members m
  WHERE m.status = 'approved'
    AND m.user_id = ANY(_ids)
    AND (
      public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role, 'moderator'::app_role, 'staff'::app_role])
      OR EXISTS (
        SELECT 1 FROM public.fan_zone_members me
        WHERE me.user_id = auth.uid() AND me.status = 'approved'
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.fan_zone_aliases(uuid[]) TO authenticated;
