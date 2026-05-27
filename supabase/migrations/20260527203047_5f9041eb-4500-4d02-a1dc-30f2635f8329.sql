CREATE TABLE IF NOT EXISTS public.forum_board_affiliate_banners (
  board_id  uuid NOT NULL REFERENCES public.forum_boards(id) ON DELETE CASCADE,
  banner_id uuid NOT NULL REFERENCES public.affiliate_banners(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, banner_id)
);

CREATE INDEX IF NOT EXISTS forum_board_affiliate_banners_banner_idx
  ON public.forum_board_affiliate_banners(banner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_board_affiliate_banners TO authenticated;
GRANT ALL ON public.forum_board_affiliate_banners TO service_role;

ALTER TABLE public.forum_board_affiliate_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view board banner assignments"
  ON public.forum_board_affiliate_banners
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admins manage board banner assignments"
  ON public.forum_board_affiliate_banners
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]));

-- Seed from the existing single-banner column so nothing disappears
INSERT INTO public.forum_board_affiliate_banners (board_id, banner_id)
SELECT id, affiliate_banner_id
  FROM public.forum_boards
 WHERE affiliate_banner_id IS NOT NULL
ON CONFLICT DO NOTHING;