
CREATE TABLE public.sports_subcategories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.sports_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, name)
);

CREATE INDEX sports_subcategories_category_id_idx ON public.sports_subcategories(category_id, sort_order);

GRANT SELECT ON public.sports_subcategories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sports_subcategories TO authenticated;
GRANT ALL ON public.sports_subcategories TO service_role;

ALTER TABLE public.sports_subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sports subcategories readable by everyone"
ON public.sports_subcategories FOR SELECT
USING (true);

CREATE POLICY "Admins/management/staff can insert subcategories"
ON public.sports_subcategories FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'management') OR
  public.has_role(auth.uid(), 'staff')
);

CREATE POLICY "Admins/management/staff can update subcategories"
ON public.sports_subcategories FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'management') OR
  public.has_role(auth.uid(), 'staff')
);

CREATE POLICY "Admins/management/staff can delete subcategories"
ON public.sports_subcategories FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'management') OR
  public.has_role(auth.uid(), 'staff')
);

-- Ensure at most one default per category.
CREATE UNIQUE INDEX sports_subcategories_one_default_per_cat
  ON public.sports_subcategories(category_id) WHERE is_default;

-- Seed existing Rugby Union subcategories.
INSERT INTO public.sports_subcategories (category_id, name, sort_order, is_default)
VALUES
  ('74f3782c-fbee-4cf7-8773-fd419849c7cd', 'League', 10, true),
  ('74f3782c-fbee-4cf7-8773-fd419849c7cd', 'Tournament', 20, false),
  ('74f3782c-fbee-4cf7-8773-fd419849c7cd', 'Sports Pass', 30, false)
ON CONFLICT (category_id, name) DO NOTHING;
