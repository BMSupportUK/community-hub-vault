
create table public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  group_label text not null default 'Community',
  icon text not null default 'Hash',
  staff_only boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  sender_id uuid not null,
  content text not null,
  created_at timestamptz not null default now()
);
create index chat_messages_channel_created_idx on public.chat_messages(channel_id, created_at desc);

alter table public.chat_channels enable row level security;
alter table public.chat_messages enable row level security;

-- channels
create policy "channels read approved" on public.chat_channels for select to authenticated
using (
  not has_role(auth.uid(), 'pending'::app_role)
  and not has_role(auth.uid(), 'banned'::app_role)
  and (
    staff_only = false
    or has_any_role(auth.uid(), array['admin'::app_role,'management'::app_role,'moderator'::app_role,'staff'::app_role])
  )
);
create policy "channels manage admin" on public.chat_channels for all to authenticated
using (has_any_role(auth.uid(), array['admin'::app_role,'management'::app_role]))
with check (has_any_role(auth.uid(), array['admin'::app_role,'management'::app_role]));

-- messages
create policy "messages read channel" on public.chat_messages for select to authenticated
using (
  exists (
    select 1 from public.chat_channels c
    where c.id = chat_messages.channel_id
      and not has_role(auth.uid(), 'pending'::app_role)
      and not has_role(auth.uid(), 'banned'::app_role)
      and (
        c.staff_only = false
        or has_any_role(auth.uid(), array['admin'::app_role,'management'::app_role,'moderator'::app_role,'staff'::app_role])
      )
  )
);
create policy "messages insert self" on public.chat_messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.chat_channels c
    where c.id = chat_messages.channel_id
      and not has_role(auth.uid(), 'pending'::app_role)
      and not has_role(auth.uid(), 'banned'::app_role)
      and (
        c.staff_only = false
        or has_any_role(auth.uid(), array['admin'::app_role,'management'::app_role,'moderator'::app_role,'staff'::app_role])
      )
  )
);
create policy "messages delete own or admin" on public.chat_messages for delete to authenticated
using (
  sender_id = auth.uid()
  or has_any_role(auth.uid(), array['admin'::app_role,'management'::app_role])
);

create trigger chat_channels_updated before update on public.chat_channels
for each row execute function public.set_updated_at();

-- realtime
alter table public.chat_messages replica identity full;
alter publication supabase_realtime add table public.chat_messages;

-- seed
insert into public.chat_channels (slug, name, group_label, icon, staff_only, sort_order) values
  ('welcome', 'welcome', 'Information', 'Megaphone', false, 10),
  ('rules', 'rules', 'Information', 'Hash', false, 20),
  ('general', 'general', 'Community', 'Hash', false, 30),
  ('off-topic', 'off-topic', 'Community', 'Hash', false, 40),
  ('staff-room', 'staff-room', 'Staff', 'Hash', true, 50);
