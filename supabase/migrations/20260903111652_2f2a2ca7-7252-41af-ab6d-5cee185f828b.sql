CREATE OR REPLACE FUNCTION public.sync_fan_zone_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fan_only boolean := false;
BEGIN
  IF NEW.status = 'approved' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'boro_fan_zone_member')
    ON CONFLICT (user_id, role) DO NOTHING;

    SELECT COALESCE(bool_or(si.extra->>'access_intent' = 'fan-zone'), false)
      INTO v_fan_only
      FROM public.signup_info si
     WHERE si.user_id = NEW.user_id;

    IF v_fan_only THEN
      -- Fan-Zone-only signup: take them out of the BM Support waiting room so
      -- no BM Support surfaces are shown to them.
      DELETE FROM public.user_roles
       WHERE user_id = NEW.user_id AND role = 'pending';
      UPDATE public.gate_applications
         SET status = 'denied'
       WHERE user_id = NEW.user_id AND status = 'pending';
    END IF;
  ELSIF NEW.status IN ('rejected', 'revoked') THEN
    DELETE FROM public.user_roles
     WHERE user_id = NEW.user_id AND role = 'boro_fan_zone_member';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fan_zone_members_sync_role ON public.fan_zone_members;
CREATE TRIGGER fan_zone_members_sync_role
AFTER INSERT OR UPDATE OF status ON public.fan_zone_members
FOR EACH ROW EXECUTE FUNCTION public.sync_fan_zone_role();

-- Backfill: existing approved members get the role.
INSERT INTO public.user_roles (user_id, role)
SELECT m.user_id, 'boro_fan_zone_member'
  FROM public.fan_zone_members m
 WHERE m.status = 'approved'
ON CONFLICT (user_id, role) DO NOTHING;

-- Backfill: Fan-Zone-only approved members leave the BM Support queue.
DELETE FROM public.user_roles ur
 WHERE ur.role = 'pending'
   AND EXISTS (
     SELECT 1 FROM public.fan_zone_members m
      WHERE m.user_id = ur.user_id AND m.status = 'approved')
   AND EXISTS (
     SELECT 1 FROM public.signup_info si
      WHERE si.user_id = ur.user_id
        AND si.extra->>'access_intent' = 'fan-zone');

UPDATE public.gate_applications ga
   SET status = 'denied'
 WHERE ga.status = 'pending'
   AND EXISTS (
     SELECT 1 FROM public.fan_zone_members m
      WHERE m.user_id = ga.user_id AND m.status = 'approved')
   AND EXISTS (
     SELECT 1 FROM public.signup_info si
      WHERE si.user_id = ga.user_id
        AND si.extra->>'access_intent' = 'fan-zone');
