
-- Remove corrupted role row, ensure proper one exists
DELETE FROM public.role_definitions WHERE name = '_oro__an__one__ember';
DELETE FROM public.user_roles WHERE role::text = '_oro__an__one__ember';

INSERT INTO public.role_definitions (name, label, is_system, is_active, sort_order)
VALUES ('boro_fan_zone_member', 'Boro Fan Zone Member', true, true, 65)
ON CONFLICT (name) DO UPDATE SET label = EXCLUDED.label, is_active = true;

-- Trigger function: keep boro_fan_zone_member role in sync with fan_zone_members status
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
      WHERE user_id = OLD.user_id AND role = 'boro_fan_zone_member'::app_role;
    RETURN OLD;
  END IF;

  target_user := NEW.user_id;
  new_status := NEW.status;

  IF new_status IN ('pending', 'approved') THEN
    INSERT INTO public.user_roles (user_id, role)
      VALUES (target_user, 'boro_fan_zone_member'::app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles
      WHERE user_id = target_user AND role = 'boro_fan_zone_member'::app_role;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fan_zone_members_sync_role ON public.fan_zone_members;
CREATE TRIGGER fan_zone_members_sync_role
AFTER INSERT OR UPDATE OF status OR DELETE ON public.fan_zone_members
FOR EACH ROW EXECUTE FUNCTION public.sync_boro_fan_zone_member_role();

-- Backfill for existing pending/approved members
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'boro_fan_zone_member'::app_role
FROM public.fan_zone_members
WHERE status IN ('pending', 'approved')
ON CONFLICT (user_id, role) DO NOTHING;
