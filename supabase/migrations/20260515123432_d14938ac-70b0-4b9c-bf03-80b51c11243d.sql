create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

alter table public.message_reactions enable row level security;

create policy "reactions read for channel viewers"
  on public.message_reactions for select to authenticated
  using (
    exists (
      select 1 from public.chat_messages m
      where m.id = message_reactions.message_id
        and can_in_channel(auth.uid(), m.channel_id, 'view'::text)
    )
  );

create policy "reactions insert own"
  on public.message_reactions for insert to authenticated
  with check (auth.uid() = user_id);

create policy "reactions delete own"
  on public.message_reactions for delete to authenticated
  using (auth.uid() = user_id);

alter table public.chat_messages add column if not exists edited_at timestamptz;

create policy "messages edit own content"
  on public.chat_messages for update to authenticated
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

alter publication supabase_realtime add table public.message_reactions;
alter table public.message_reactions replica identity full;