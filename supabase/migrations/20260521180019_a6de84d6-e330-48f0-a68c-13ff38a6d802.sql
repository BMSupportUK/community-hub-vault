create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists idx_push_subscriptions_user on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
create policy "push subs select own" on public.push_subscriptions for select
  using (auth.uid() = user_id or has_role(auth.uid(), 'admin'::app_role));
create policy "push subs insert own" on public.push_subscriptions for insert
  with check (auth.uid() = user_id);
create policy "push subs update own" on public.push_subscriptions for update
  using (auth.uid() = user_id);
create policy "push subs delete own" on public.push_subscriptions for delete
  using (auth.uid() = user_id or has_role(auth.uid(), 'admin'::app_role));