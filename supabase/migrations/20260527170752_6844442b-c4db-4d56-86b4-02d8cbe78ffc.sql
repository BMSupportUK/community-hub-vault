ALTER TABLE public.forum_boards
  ADD COLUMN IF NOT EXISTS affiliate_banner_url text,
  ADD COLUMN IF NOT EXISTS affiliate_banner_link text,
  ADD COLUMN IF NOT EXISTS affiliate_banner_alt text;