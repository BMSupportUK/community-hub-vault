
-- Nameplate catalog
CREATE TABLE public.nameplates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  image_url text,
  gradient_css text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (image_url IS NOT NULL OR gradient_css IS NOT NULL)
);
ALTER TABLE public.nameplates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nameplates read approved" ON public.nameplates
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND NOT public.has_role(auth.uid(), 'pending'::app_role)
    AND NOT public.has_role(auth.uid(), 'banned'::app_role)
  );

CREATE POLICY "nameplates admin all" ON public.nameplates
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE TRIGGER nameplates_set_updated_at
  BEFORE UPDATE ON public.nameplates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- User unlocks
CREATE TABLE public.user_nameplates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nameplate_id uuid NOT NULL REFERENCES public.nameplates(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, nameplate_id)
);
ALTER TABLE public.user_nameplates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_nameplates self read" ON public.user_nameplates
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE POLICY "user_nameplates admin write" ON public.user_nameplates
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE INDEX idx_user_nameplates_user ON public.user_nameplates(user_id);

-- Equipped nameplate on profile
ALTER TABLE public.profiles
  ADD COLUMN equipped_nameplate_id uuid REFERENCES public.nameplates(id) ON DELETE SET NULL;

-- Trigger: enforce user can only equip a nameplate they have unlocked
CREATE OR REPLACE FUNCTION public.validate_equipped_nameplate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.equipped_nameplate_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.equipped_nameplate_id IS NOT DISTINCT FROM NEW.equipped_nameplate_id THEN
    RETURN NEW;
  END IF;
  IF public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]) THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_nameplates
    WHERE user_id = NEW.id AND nameplate_id = NEW.equipped_nameplate_id
  ) THEN
    RAISE EXCEPTION 'You have not unlocked that nameplate';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_validate_equipped_nameplate
  BEFORE UPDATE OF equipped_nameplate_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_equipped_nameplate();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('nameplates', 'nameplates', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "nameplate images public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'nameplates');

CREATE POLICY "nameplate images admin write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'nameplates' AND public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE POLICY "nameplate images admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'nameplates' AND public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE POLICY "nameplate images admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'nameplates' AND public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));
