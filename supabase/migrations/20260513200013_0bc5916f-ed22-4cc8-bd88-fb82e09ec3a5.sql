
create table public.sports_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.sports_blogs (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.sports_categories(id) on delete cascade,
  title text not null,
  excerpt text,
  body text,
  image_url text,
  badge text,
  published boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.sports_blogs(category_id);

alter table public.sports_categories enable row level security;
alter table public.sports_blogs enable row level security;

create policy "view categories" on public.sports_categories for select to authenticated using (true);
create policy "manage categories" on public.sports_categories for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','management','moderator']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','management','moderator']::public.app_role[]));

create policy "view blogs" on public.sports_blogs for select to authenticated using (published or public.has_any_role(auth.uid(), array['admin','management','moderator']::public.app_role[]));
create policy "manage blogs" on public.sports_blogs for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','management','moderator']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','management','moderator']::public.app_role[]));

insert into public.sports_categories (name, slug, sort_order) values
  ('Daily Sports & PPV','daily-sports-ppv',1),
  ('Boxing','boxing',2),
  ('Cricket','cricket',3),
  ('Football | UK & Scottish','football-uk-scottish',4),
  ('Football | Other League','football-other-league',5),
  ('Motorbike Racing','motorbike-racing',6),
  ('Motorcar Racing','motorcar-racing',7),
  ('Other Sports','other-sports',8),
  ('Tennis','tennis',9);
