create table if not exists public.channel_welcome_embeds (
  channel_id uuid primary key references public.chat_channels(id) on delete cascade,
  title text not null default 'Welcome',
  body text not null default '',
  image_url text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.channel_welcome_embeds enable row level security;

drop policy if exists "anyone can read welcome embeds" on public.channel_welcome_embeds;
create policy "anyone can read welcome embeds"
  on public.channel_welcome_embeds for select
  to authenticated
  using (true);

drop policy if exists "admins manage welcome embeds" on public.channel_welcome_embeds;
create policy "admins manage welcome embeds"
  on public.channel_welcome_embeds for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'management'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'management'));

alter publication supabase_realtime add table public.channel_welcome_embeds;