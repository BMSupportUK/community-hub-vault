CREATE OR REPLACE FUNCTION public.user_qualifies_for_customer_nameplate(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (
      SELECT 1 FROM public.gate_applications ga
      WHERE ga.user_id = _user_id
        AND ga.status = 'approved'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role IN ('admin', 'management', 'staff', 'moderator', 'pending', 'rejected', 'banned')
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = _user_id
          AND ur.role IN ('member', 'subscriber', 'nonsubscriber')
      )
      OR (
        NOT EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = _user_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.fan_zone_members fm
          WHERE fm.user_id = _user_id
        )
      )
    )
$function$;

CREATE OR REPLACE FUNCTION public.apply_customer_nameplate(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  customer_plate constant uuid := 'a1f0c001-0000-4000-8000-000000000007'::uuid;
BEGIN
  IF public.user_qualifies_for_customer_nameplate(_user_id) THEN
    INSERT INTO public.user_nameplates (user_id, nameplate_id)
    VALUES (_user_id, customer_plate)
    ON CONFLICT DO NOTHING;

    UPDATE public.profiles
    SET equipped_nameplate_id = customer_plate
    WHERE id = _user_id
      AND equipped_nameplate_id IS NULL;
  ELSE
    DELETE FROM public.user_nameplates
    WHERE user_id = _user_id
      AND nameplate_id = customer_plate;

    UPDATE public.profiles
    SET equipped_nameplate_id = NULL
    WHERE id = _user_id
      AND equipped_nameplate_id = customer_plate;
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.sync_customer_nameplate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid;
BEGIN
  uid := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  PERFORM public.apply_customer_nameplate(uid);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$function$;

CREATE OR REPLACE FUNCTION public.sync_customer_nameplate_from_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.apply_customer_nameplate(NEW.user_id);
  RETURN NEW;
END
$function$;

CREATE TRIGGER trg_sync_customer_nameplate_from_gate
AFTER INSERT OR UPDATE OF status ON public.gate_applications
FOR EACH ROW
EXECUTE FUNCTION public.sync_customer_nameplate_from_gate();

INSERT INTO public.user_nameplates (user_id, nameplate_id)
SELECT p.id, 'a1f0c001-0000-4000-8000-000000000007'::uuid
FROM public.profiles p
WHERE public.user_qualifies_for_customer_nameplate(p.id)
ON CONFLICT DO NOTHING;

UPDATE public.profiles p
SET equipped_nameplate_id = 'a1f0c001-0000-4000-8000-000000000007'::uuid
WHERE p.equipped_nameplate_id IS NULL
  AND public.user_qualifies_for_customer_nameplate(p.id);