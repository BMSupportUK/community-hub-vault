alter table public.affiliate_banners
  add column if not exists size text not null default 'skyscraper';

alter table public.affiliate_banners
  drop constraint if exists affiliate_banners_size_check;

alter table public.affiliate_banners
  add constraint affiliate_banners_size_check
  check (size in ('leaderboard', 'skyscraper'));