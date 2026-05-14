
CREATE TABLE public.install_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.install_blogs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.install_categories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  excerpt TEXT,
  body TEXT,
  image_url TEXT,
  pdf_url TEXT,
  badge TEXT,
  published BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.install_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.install_blogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view install categories"
  ON public.install_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage install categories"
  ON public.install_categories FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role]));

CREATE POLICY "view install blogs"
  ON public.install_blogs FOR SELECT TO authenticated
  USING (published OR has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role]));
CREATE POLICY "manage install blogs"
  ON public.install_blogs FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role]));

CREATE TRIGGER install_blogs_updated_at
  BEFORE UPDATE ON public.install_blogs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
