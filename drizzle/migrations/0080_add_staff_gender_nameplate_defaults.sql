ALTER TABLE public.profiles
  ADD COLUMN staff_gender text NOT NULL DEFAULT 'male';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_staff_gender_check CHECK (staff_gender IN ('male', 'female'));

CREATE OR REPLACE FUNCTION public.staff_nameplate_for_role(_role public.app_role, _gender text DEFAULT 'male')
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _role = 'staff' AND _gender = 'female' THEN 'a1f0c001-0000-4000-8000-000000000004'::uuid
    WHEN _role = 'moderator' AND _gender = 'female' THEN 'a1f0c001-0000-4000-8000-000000000005'::uuid
    WHEN _role IN ('management', 'admin') AND _gender = 'female' THEN 'a1f0c001-0000-4000-8000-000000000006'::uuid
    WHEN _role = 'staff' THEN 'a1f0c001-0000-4000-8000-000000000001'::uuid
    WHEN _role = 'moderator' THEN 'a1f0c001-0000-4000-8000-000000000002'::uuid
    WHEN _role IN ('management', 'admin') THEN 'a1f0c001-0000-4000-8000-000000000003'::uuid
    ELSE NULL
  END
$function$;

CREATE OR REPLACE FUNCTION public.staff_nameplate_is_default(_nameplate_id uuid)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT _nameplate_id IN (
    'a1f0c001-0000-4000-8000-000000000001'::uuid,
    'a1f0c001-0000-4000-8000-000000000002'::uuid,
    'a1f0c001-0000-4000-8000-000000000003'::uuid,
    'a1f0c001-0000-4000-8000-000000000004'::uuid,
    'a1f0c001-0000-4000-8000-000000000005'::uuid,
    'a1f0c001-0000-4000-8000-000000000006'::uuid
  )
$function$;

CREATE OR REPLACE FUNCTION public.staff_default_nameplate_for_user(_user_id uuid, _gender text DEFAULT 'male')
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.staff_nameplate_for_role(ur.role, _gender)
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id
    AND ur.role IN ('admin', 'management', 'moderator', 'staff')
  ORDER BY CASE ur.role
    WHEN 'admin' THEN 1
    WHEN 'management' THEN 2
    WHEN 'moderator' THEN 3
    WHEN 'staff' THEN 4
    ELSE 5
  END
  LIMIT 1
$function$;

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

  RETURN OLD;
END
$function$;

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

CREATE TRIGGER trg_sync_staff_gender_nameplate
AFTER UPDATE OF staff_gender ON public.profiles
FOR EACH ROW
WHEN (OLD.staff_gender IS DISTINCT FROM NEW.staff_gender)
EXECUTE FUNCTION public.sync_staff_gender_nameplate();