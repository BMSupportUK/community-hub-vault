INSERT INTO public.nameplates (
  id,
  name,
  description,
  image_url,
  gradient_css,
  is_active,
  sort_order,
  animation_class,
  is_free
) VALUES (
  'a1f0c001-0000-4000-8000-000000000008'::uuid,
  'Customer Male',
  'Default male BM Support customer name card',
  NULL,
  'var(--gradient-primary)',
  true,
  17,
  'nameplate-customer-male',
  false
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  image_url = EXCLUDED.image_url,
  gradient_css = EXCLUDED.gradient_css,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  animation_class = EXCLUDED.animation_class,
  is_free = EXCLUDED.is_free,
  updated_at = now();

UPDATE public.nameplates
SET
  name = 'Customer Female',
  description = 'Default female BM Support customer name card',
  animation_class = 'nameplate-customer-female',
  updated_at = now()
WHERE id = 'a1f0c001-0000-4000-8000-000000000007'::uuid;

CREATE OR REPLACE FUNCTION public.customer_nameplate_for_gender(_gender text DEFAULT 'male')
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _gender = 'female' THEN 'a1f0c001-0000-4000-8000-000000000007'::uuid
    ELSE 'a1f0c001-0000-4000-8000-000000000008'::uuid
  END
$function$;

CREATE OR REPLACE FUNCTION public.customer_nameplate_is_default(_nameplate_id uuid)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT _nameplate_id IN (
    'a1f0c001-0000-4000-8000-000000000007'::uuid,
    'a1f0c001-0000-4000-8000-000000000008'::uuid
  )
$function$;

CREATE OR REPLACE FUNCTION public.apply_customer_nameplate(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  desired uuid;
  current_equipped uuid;
BEGIN
  IF public.user_qualifies_for_customer_nameplate(_user_id) THEN
    SELECT public.customer_nameplate_for_gender(COALESCE(p.staff_gender, 'male')),
           p.equipped_nameplate_id
    INTO desired, current_equipped
    FROM public.profiles p
    WHERE p.id = _user_id;

    IF desired IS NULL THEN
      RETURN;
    END IF;

    DELETE FROM public.user_nameplates
    WHERE user_id = _user_id
      AND public.customer_nameplate_is_default(nameplate_id)
      AND nameplate_id <> desired;

    INSERT INTO public.user_nameplates (user_id, nameplate_id)
    VALUES (_user_id, desired)
    ON CONFLICT DO NOTHING;

    UPDATE public.profiles
    SET equipped_nameplate_id = desired
    WHERE id = _user_id
      AND (
        current_equipped IS NULL
        OR public.customer_nameplate_is_default(current_equipped)
      );
  ELSE
    DELETE FROM public.user_nameplates
    WHERE user_id = _user_id
      AND public.customer_nameplate_is_default(nameplate_id);

    UPDATE public.profiles
    SET equipped_nameplate_id = NULL
    WHERE id = _user_id
      AND public.customer_nameplate_is_default(equipped_nameplate_id);
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.sync_customer_gender_nameplate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.apply_customer_nameplate(NEW.id);
  RETURN NEW;
END
$function$;

CREATE TRIGGER trg_sync_customer_gender_nameplate
AFTER UPDATE OF staff_gender ON public.profiles
FOR EACH ROW
WHEN (OLD.staff_gender IS DISTINCT FROM NEW.staff_gender)
EXECUTE FUNCTION public.sync_customer_gender_nameplate();

REVOKE ALL ON FUNCTION public.customer_nameplate_for_gender(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_customer_gender_nameplate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_nameplate_for_gender(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_customer_gender_nameplate() TO service_role;

INSERT INTO public.user_nameplates (user_id, nameplate_id)
SELECT p.id, public.customer_nameplate_for_gender(COALESCE(p.staff_gender, 'male'))
FROM public.profiles p
WHERE public.user_qualifies_for_customer_nameplate(p.id)
ON CONFLICT DO NOTHING;

DELETE FROM public.user_nameplates unp
WHERE public.customer_nameplate_is_default(unp.nameplate_id)
  AND unp.nameplate_id <> public.customer_nameplate_for_gender(
    COALESCE((SELECT p.staff_gender FROM public.profiles p WHERE p.id = unp.user_id), 'male')
  );

UPDATE public.profiles p
SET equipped_nameplate_id = public.customer_nameplate_for_gender(COALESCE(p.staff_gender, 'male'))
WHERE public.user_qualifies_for_customer_nameplate(p.id)
  AND (
    p.equipped_nameplate_id IS NULL
    OR public.customer_nameplate_is_default(p.equipped_nameplate_id)
  );