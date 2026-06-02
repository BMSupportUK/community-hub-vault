
CREATE TABLE public.sport_cover_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.sports_categories(id) ON DELETE CASCADE,
  subcategory TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, subcategory)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sport_cover_cache TO authenticated;
GRANT ALL ON public.sport_cover_cache TO service_role;

ALTER TABLE public.sport_cover_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff manage sport_cover_cache"
ON public.sport_cover_cache
FOR ALL
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role]));
