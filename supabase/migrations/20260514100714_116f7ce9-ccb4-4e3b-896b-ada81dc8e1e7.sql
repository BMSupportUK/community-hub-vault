
-- Role definitions: tracks which app_role enum values are active and customizable
CREATE TABLE IF NOT EXISTS public.role_definitions (
  name TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.role_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_defs read approved" ON public.role_definitions
  FOR SELECT TO authenticated
  USING (NOT public.has_role(auth.uid(), 'pending'::app_role) AND NOT public.has_role(auth.uid(), 'banned'::app_role));

CREATE POLICY "role_defs manage admin" ON public.role_definitions
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]));

CREATE TRIGGER trg_role_defs_updated_at BEFORE UPDATE ON public.role_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed with existing enum values
INSERT INTO public.role_definitions (name, label, is_system, sort_order) VALUES
  ('admin','Admin',true,10),
  ('management','Management',true,20),
  ('moderator','Moderator',true,30),
  ('staff','Staff',true,40),
  ('member','Member',true,50),
  ('pending','Pending',true,60),
  ('banned','Banned',true,70)
ON CONFLICT (name) DO NOTHING;

-- Function to add a brand-new role: appends to enum AND inserts a definition row
CREATE OR REPLACE FUNCTION public.create_app_role(_name TEXT, _label TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_name TEXT;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  clean_name := lower(regexp_replace(coalesce(_name,''), '[^a-z0-9_]', '_', 'g'));
  IF clean_name = '' OR length(clean_name) > 40 THEN
    RAISE EXCEPTION 'Invalid role name';
  END IF;

  -- Add to enum if not present
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = clean_name
  ) THEN
    EXECUTE format('ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS %L', clean_name);
  END IF;

  INSERT INTO public.role_definitions (name, label, is_system, sort_order)
  VALUES (clean_name, coalesce(nullif(trim(_label),''), clean_name), false, 100)
  ON CONFLICT (name) DO UPDATE SET is_active = true, label = EXCLUDED.label;
END;
$$;

-- Function to soft-delete a role: removes all assignments and marks inactive
-- (Postgres enum values cannot be removed, but the role disappears from the UI)
CREATE OR REPLACE FUNCTION public.delete_app_role(_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_sys BOOLEAN;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT is_system INTO is_sys FROM public.role_definitions WHERE name = _name;
  IF is_sys THEN
    RAISE EXCEPTION 'Cannot delete system role';
  END IF;

  -- Cast through text since the enum value still exists; matching by text is safe
  EXECUTE format('DELETE FROM public.user_roles WHERE role::text = %L', _name);

  UPDATE public.role_definitions SET is_active = false WHERE name = _name;
END;
$$;
