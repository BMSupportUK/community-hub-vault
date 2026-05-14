create table if not exists public.nav_order (
  key text primary key,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.nav_order enable row level security;
drop policy if exists "nav_order readable by all" on public.nav_order;
create policy "nav_order readable by all" on public.nav_order for select using (true);
drop policy if exists "nav_order admin write" on public.nav_order;
create policy "nav_order admin write" on public.nav_order
  for all using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'management'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'management'));
alter publication supabase_realtime add table public.nav_order;