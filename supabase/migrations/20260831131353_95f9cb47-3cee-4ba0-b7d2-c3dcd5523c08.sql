CREATE OR REPLACE FUNCTION public.sync_boro_fan_zone_member_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user uuid;
  new_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.user_roles
      WHERE user_id = OLD.user_id
        AND role = 'boro_fan_zone_member'::app_role;
    RETURN OLD;
  END IF;

  target_user := NEW.user_id;
  new_status := NEW.status;

  IF new_status IN ('pending', 'approved') THEN
    INSERT INTO public.user_roles (user_id, role)
      VALUES (target_user, 'boro_fan_zone_member'::app_role)
      ON CONFLICT (user_id, role) DO NOTHING;

    IF TG_OP = 'INSERT' THEN
      DELETE FROM public.user_roles
        WHERE user_id = target_user
          AND role <> 'boro_fan_zone_member'::app_role
          AND role NOT IN (
            'admin'::app_role,
            'management'::app_role,
            'staff'::app_role,
            'moderator'::app_role,
            'boro_fan_zone_moderator'::app_role,
            'subscriber'::app_role,
            'nonsubscriber'::app_role,
            'member'::app_role
          );
    END IF;
  ELSE
    DELETE FROM public.user_roles
      WHERE user_id = target_user
        AND role = 'boro_fan_zone_member'::app_role;
  END IF;

  RETURN NEW;
END;
$$;