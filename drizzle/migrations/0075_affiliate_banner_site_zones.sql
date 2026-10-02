ALTER TABLE public.affiliate_banners
  ADD COLUMN IF NOT EXISTS site text NOT NULL DEFAULT 'bm_support',
  ADD COLUMN IF NOT EXISTS zones text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.affiliate_banners
  ADD CONSTRAINT affiliate_banners_site_check CHECK (site IN ('bm_support','fan_zone'));
COMMENT ON COLUMN public.affiliate_banners.zones IS 'BM Support page zones the banner shows in; empty = all zones';