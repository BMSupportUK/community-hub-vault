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
  'a1f0c001-0000-4000-8000-000000000007'::uuid,
  'Customer',
  'Default BM Support customer name card',
  NULL,
  'var(--gradient-primary)',
  true,
  16,
  'nameplate-customer',
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

CREATE OR REPLACE FUNCTION public.customer_nameplate_is_default(_nameplate_id uuid)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT _nameplate_id = 'a1f0c001-0000-4000-8000-000000000007'::uuid
$function$;

CREATE OR REPLACE FUNCTION public.sync_customer_nameplate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid;
  customer_plate constant uuid := 'a1f0c001-0000-4000-8000-000000000007'::uuid;
  has_customer_role boolean;
  has_staff_role boolean;
  has_excluded_role boolean;
BEGIN
  uid := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;

  SELECT
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = uid
        AND ur.role IN ('member', 'subscriber', 'nonsubscriber')
    ),
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = uid
        AND ur.role IN ('admin', 'management', 'staff', 'moderator')
    ),
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = uid
        AND ur.role IN ('pending', 'rejected', 'banned')
    )
  INTO has_customer_role, has_staff_role, has_excluded_role;

  IF has_customer_role AND NOT has_staff_role AND NOT has_excluded_role THEN
    INSERT INTO public.user_nameplates (user_id, nameplate_id)
    VALUES (uid, customer_plate)
    ON CONFLICT DO NOTHING;

    UPDATE public.profiles
    SET equipped_nameplate_id = customer_plate
    WHERE id = uid
      AND equipped_nameplate_id IS NULL;
  ELSE
    DELETE FROM public.user_nameplates
    WHERE user_id = uid
      AND nameplate_id = customer_plate;

    UPDATE public.profiles
    SET equipped_nameplate_id = NULL
    WHERE id = uid
      AND equipped_nameplate_id = customer_plate;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$function$;

CREATE TRIGGER trg_sync_customer_nameplate
AFTER INSERT OR DELETE OR UPDATE OF role ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.sync_customer_nameplate();

INSERT INTO public.user_nameplates (user_id, nameplate_id)
SELECT DISTINCT ur.user_id, 'a1f0c001-0000-4000-8000-000000000007'::uuid
FROM public.user_roles ur
WHERE ur.role IN ('member', 'subscriber', 'nonsubscriber')
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles staff_role
    WHERE staff_role.user_id = ur.user_id
      AND staff_role.role IN ('admin', 'management', 'staff', 'moderator')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles excluded_role
    WHERE excluded_role.user_id = ur.user_id
      AND excluded_role.role IN ('pending', 'rejected', 'banned')
  )
ON CONFLICT DO NOTHING;

UPDATE public.profiles p
SET equipped_nameplate_id = 'a1f0c001-0000-4000-8000-000000000007'::uuid
WHERE p.equipped_nameplate_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id
      AND ur.role IN ('member', 'subscriber', 'nonsubscriber')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles staff_role
    WHERE staff_role.user_id = p.id
      AND staff_role.role IN ('admin', 'management', 'staff', 'moderator')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles excluded_role
    WHERE excluded_role.user_id = p.id
      AND excluded_role.role IN ('pending', 'rejected', 'banned')
  );