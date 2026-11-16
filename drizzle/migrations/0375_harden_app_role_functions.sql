CREATE OR REPLACE FUNCTION public.delete_app_role(_name text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE is_sys BOOLEAN;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT is_system INTO is_sys FROM public.role_definitions WHERE name = _name;
  IF is_sys IS NULL THEN RAISE EXCEPTION 'Unknown role'; END IF;
  IF is_sys THEN RAISE EXCEPTION 'Cannot delete system role'; END IF;
  DELETE FROM public.user_roles WHERE role::text = _name;
  UPDATE public.role_definitions SET is_active = false WHERE name = _name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_app_role(_name text, _label text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE clean_name TEXT;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  clean_name := lower(regexp_replace(trim(coalesce(_name,'')), '[^A-Za-z0-9_]', '_', 'g'));
  IF clean_name !~ '^[a-z][a-z0-9_]{0,39}$' THEN
    RAISE EXCEPTION 'Invalid role name';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'app_role' AND e.enumlabel = clean_name) THEN
    -- Enum values cannot be added with static SQL; the name is strictly validated above and quoted as a literal.
    EXECUTE format('ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS %L', clean_name);
  END IF;
  INSERT INTO public.role_definitions (name, label, is_system, sort_order)
  VALUES (clean_name, left(coalesce(nullif(trim(_label),''), clean_name), 60), false, 100)
  ON CONFLICT (name) DO UPDATE SET is_active = true, label = EXCLUDED.label;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_app_role(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_app_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_app_role(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_app_role(text) TO authenticated;