
-- ROLE ENUM
create type public.app_role as enum ('admin','management','staff','moderator','member','pending');

-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- USER ROLES
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

-- HAS_ROLE FUNCTION (security definer to avoid RLS recursion)
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.has_any_role(_user_id uuid, _roles app_role[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = any(_roles))
$$;

-- GATE APPLICATIONS
create type public.gate_status as enum ('pending','approved','denied');

create table public.gate_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  status gate_status not null default 'pending',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.gate_applications enable row level security;

-- GATE MESSAGES
create table public.gate_messages (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.gate_applications(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.gate_messages enable row level security;

create index on public.gate_messages (application_id, created_at);

-- ============== POLICIES ==============

-- profiles: anyone signed in can read; user updates own
create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "profiles insert self" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles update self" on public.profiles for update to authenticated using (auth.uid() = id);

-- user_roles
create policy "roles read self" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_any_role(auth.uid(), array['admin','management']::app_role[]));
create policy "roles admin manage" on public.user_roles for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','management']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','management']::app_role[]));

-- gate_applications
create policy "gate app read own or staff" on public.gate_applications for select to authenticated
  using (user_id = auth.uid() or public.has_any_role(auth.uid(), array['admin','management','moderator']::app_role[]));
create policy "gate app insert self" on public.gate_applications for insert to authenticated
  with check (user_id = auth.uid());
create policy "gate app update staff" on public.gate_applications for update to authenticated
  using (public.has_any_role(auth.uid(), array['admin','management','moderator']::app_role[]));

-- gate_messages
create policy "gate msg read participants" on public.gate_messages for select to authenticated
  using (
    exists (select 1 from public.gate_applications a where a.id = application_id and a.user_id = auth.uid())
    or public.has_any_role(auth.uid(), array['admin','management','moderator']::app_role[])
  );
create policy "gate msg insert participants" on public.gate_messages for insert to authenticated
  with check (
    sender_id = auth.uid() and (
      exists (select 1 from public.gate_applications a where a.id = application_id and a.user_id = auth.uid())
      or public.has_any_role(auth.uid(), array['admin','management','moderator']::app_role[])
    )
  );

-- ============== SIGNUP TRIGGER ==============
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare new_app_id uuid;
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );

  insert into public.user_roles (user_id, role) values (new.id, 'pending');

  insert into public.gate_applications (user_id) values (new.id) returning id into new_app_id;

  -- seed welcome message from system (sender = same user; content describes it)
  insert into public.gate_messages (application_id, sender_id, content)
  values (new_app_id, new.id, 'Hi! I would like to join the server.');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- enable realtime
alter publication supabase_realtime add table public.gate_messages;
alter publication supabase_realtime add table public.gate_applications;
alter publication supabase_realtime add table public.user_roles;
