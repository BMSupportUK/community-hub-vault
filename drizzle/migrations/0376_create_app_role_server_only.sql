CREATE OR REPLACE FUNCTION public.create_app_role(_name text, _label text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE clean_name TEXT;
BEGIN
  -- Only the website's server (service role) may call this; it checks the caller is admin/management first.
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  clean_name := lower(regexp_replace(trim(coalesce(_name,'')), '[^A-Za-z0-9_]', '_', 'g'));
  IF clean_name !~ '^[a-z][a-z0-9_]{0,39}$' THEN
    RAISE EXCEPTION 'Invalid role name';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'app_role' AND e.enumlabel = clean_name) THEN
    EXECUTE format('ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS %L', clean_name);
  END IF;
  INSERT INTO public.role_definitions (name, label, is_system, sort_order)
  VALUES (clean_name, left(coalesce(nullif(trim(_label),''), clean_name), 60), false, 100)
  ON CONFLICT (name) DO UPDATE SET is_active = true, label = EXCLUDED.label;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.create_app_role(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_app_role(text, text) TO service_role;