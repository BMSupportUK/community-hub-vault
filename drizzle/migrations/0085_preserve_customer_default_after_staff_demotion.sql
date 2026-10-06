CREATE OR REPLACE FUNCTION public.sync_staff_nameplates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid;
  gender_choice text;
  desired uuid;
  old_male uuid;
  old_female uuid;
BEGIN
  uid := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  SELECT COALESCE(p.staff_gender, 'male') INTO gender_choice
  FROM public.profiles p
  WHERE p.id = uid;

  IF TG_OP = 'INSERT' THEN
    desired := public.staff_nameplate_for_role(NEW.role, gender_choice);
    IF desired IS NOT NULL THEN
      INSERT INTO public.user_nameplates (user_id, nameplate_id)
      VALUES (uid, desired)
      ON CONFLICT DO NOTHING;

      UPDATE public.profiles
      SET equipped_nameplate_id = desired
      WHERE id = uid AND equipped_nameplate_id IS NULL;
    END IF;
    RETURN NEW;
  END IF;

  old_male := public.staff_nameplate_for_role(OLD.role, 'male');
  old_female := public.staff_nameplate_for_role(OLD.role, 'female');
  desired := public.staff_default_nameplate_for_user(uid, gender_choice);

  IF old_male IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = uid
      AND public.staff_nameplate_for_role(ur.role, 'male') = old_male
  ) THEN
    DELETE FROM public.user_nameplates
    WHERE user_id = uid AND nameplate_id IN (old_male, old_female);
  END IF;

  IF desired IS NOT NULL THEN
    INSERT INTO public.user_nameplates (user_id, nameplate_id)
    VALUES (uid, desired)
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.profiles
  SET equipped_nameplate_id = desired
  WHERE id = uid
    AND public.staff_nameplate_is_default(equipped_nameplate_id);

  IF desired IS NULL THEN
    PERFORM public.apply_customer_nameplate(uid);
  END IF;

  RETURN OLD;
END
$function$;