ALTER TABLE public.install_blogs
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS file_mime text,
  ADD COLUMN IF NOT EXISTS file_size integer,
  ADD COLUMN IF NOT EXISTS file_name text;

CREATE TABLE IF NOT EXISTS public.guide_passcodes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  blog_id uuid NOT NULL REFERENCES public.install_blogs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  code_hash text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.guide_passcodes TO authenticated;
GRANT ALL ON public.guide_passcodes TO service_role;

ALTER TABLE public.guide_passcodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own guide passcodes"
  ON public.guide_passcodes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE INDEX IF NOT EXISTS guide_passcodes_user_blog_idx
  ON public.guide_passcodes (user_id, blog_id, expires_at DESC);

CREATE TRIGGER update_guide_passcodes_updated_at
  BEFORE UPDATE ON public.guide_passcodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Staff manage guide files"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'guide-files' AND public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]))
  WITH CHECK (bucket_id = 'guide-files' AND public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));