
-- Affiliate banners library
CREATE TABLE public.affiliate_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  image_url text NOT NULL,
  link_url text,
  alt_text text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.affiliate_banners TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.affiliate_banners TO authenticated;
GRANT ALL ON public.affiliate_banners TO service_role;

ALTER TABLE public.affiliate_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view affiliate banners"
  ON public.affiliate_banners FOR SELECT
  USING (true);

CREATE POLICY "Admins manage affiliate banners insert"
  ON public.affiliate_banners FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE POLICY "Admins manage affiliate banners update"
  ON public.affiliate_banners FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE POLICY "Admins manage affiliate banners delete"
  ON public.affiliate_banners FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE TRIGGER affiliate_banners_set_updated_at
  BEFORE UPDATE ON public.affiliate_banners
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add reference column to forum_boards
ALTER TABLE public.forum_boards
  ADD COLUMN affiliate_banner_id uuid REFERENCES public.affiliate_banners(id) ON DELETE SET NULL;

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('affiliate-banners', 'affiliate-banners', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read affiliate banner files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'affiliate-banners');

CREATE POLICY "Admins upload affiliate banner files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'affiliate-banners' AND public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE POLICY "Admins update affiliate banner files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'affiliate-banners' AND public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE POLICY "Admins delete affiliate banner files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'affiliate-banners' AND public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));
