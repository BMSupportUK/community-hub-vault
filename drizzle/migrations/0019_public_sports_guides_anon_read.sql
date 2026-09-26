GRANT SELECT ON public.sports_blogs TO anon;
GRANT SELECT ON public.sports_categories TO anon;
GRANT SELECT ON public.sports_subcategories TO anon;

CREATE POLICY "public view published blogs" ON public.sports_blogs
  FOR SELECT TO anon
  USING (published);

CREATE POLICY "public view categories" ON public.sports_categories
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "public view subcategories" ON public.sports_subcategories
  FOR SELECT TO anon
  USING (true);