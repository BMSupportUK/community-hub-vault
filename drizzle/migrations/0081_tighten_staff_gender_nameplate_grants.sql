CREATE OR REPLACE FUNCTION public.sync_staff_gender_nameplate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  desired uuid;
BEGIN
  desired := public.staff_default_nameplate_for_user(NEW.id, NEW.staff_gender);
  IF desired IS NULL THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.user_nameplates
  WHERE user_id = NEW.id
    AND public.staff_nameplate_is_default(nameplate_id)
    AND nameplate_id <> desired;

  INSERT INTO public.user_nameplates (user_id, nameplate_id)
  VALUES (NEW.id, desired)
  ON CONFLICT DO NOTHING;

  IF NEW.equipped_nameplate_id IS NULL
     OR public.staff_nameplate_is_default(NEW.equipped_nameplate_id) THEN
    UPDATE public.profiles
    SET equipped_nameplate_id = desired
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END
$function$;