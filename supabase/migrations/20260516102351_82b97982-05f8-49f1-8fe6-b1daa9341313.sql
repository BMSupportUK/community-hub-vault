-- KB Categories
create table if not exists public.kb_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  icon text not null default 'BookOpen',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kb_categories enable row level security;

create policy "kb_categories read approved" on public.kb_categories for select to authenticated
  using (not has_role(auth.uid(),'pending'::app_role) and not has_role(auth.uid(),'banned'::app_role));

create policy "kb_categories manage staff" on public.kb_categories for all to authenticated
  using (has_any_role(auth.uid(), array['admin','management','moderator']::app_role[]))
  with check (has_any_role(auth.uid(), array['admin','management','moderator']::app_role[]));

create trigger kb_categories_updated_at before update on public.kb_categories
  for each row execute function public.set_updated_at();

-- KB Articles
create table if not exists public.kb_articles (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.kb_categories(id) on delete cascade,
  title text not null,
  slug text not null,
  excerpt text,
  body text,
  image_url text,
  badge text,
  published boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, slug)
);

create index if not exists kb_articles_cat_idx on public.kb_articles(category_id, sort_order);

alter table public.kb_articles enable row level security;

create policy "kb_articles read approved" on public.kb_articles for select to authenticated
  using (
    (not has_role(auth.uid(),'pending'::app_role) and not has_role(auth.uid(),'banned'::app_role))
    and (published or has_any_role(auth.uid(), array['admin','management','moderator']::app_role[]))
  );

create policy "kb_articles manage staff" on public.kb_articles for all to authenticated
  using (has_any_role(auth.uid(), array['admin','management','moderator']::app_role[]))
  with check (has_any_role(auth.uid(), array['admin','management','moderator']::app_role[]));

create trigger kb_articles_updated_at before update on public.kb_articles
  for each row execute function public.set_updated_at();

-- Seed a couple of starter categories so the page is not empty on first load.
insert into public.kb_categories (name, slug, icon, sort_order) values
  ('Getting Started','getting-started','Sparkles', 10),
  ('Account & Billing','account-billing','CreditCard', 20),
  ('Troubleshooting','troubleshooting','Wrench', 30)
on conflict (slug) do nothing;

-- Default welcome message in app_settings.
insert into public.app_settings (key, value)
values ('kb_welcome', jsonb_build_object(
  'title','Welcome to the Knowledge Base',
  'body','Search our guides or browse by category to find answers fast. Need more help? Open a ticket from the Tickets page.'
))
on conflict (key) do nothing;