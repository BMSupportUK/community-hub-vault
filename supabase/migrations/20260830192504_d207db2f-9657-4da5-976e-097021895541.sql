-- 1. profiles: respect is_private for non-owners/non-admins
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or coalesce(is_private, false) = false
  or public.has_any_role(auth.uid(), array['admin','management']::public.app_role[])
  or exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = auth.uid() and f.addressee_id = profiles.id)
        or (f.addressee_id = auth.uid() and f.requester_id = profiles.id))
  )
);

-- 2. user_roles: own roles, plus publicly-displayed staff roles, plus admins
drop policy if exists "roles read authenticated" on public.user_roles;
create policy "roles read self or public staff" on public.user_roles
for select to authenticated
using (
  user_id = auth.uid()
  or role in ('admin','management','moderator','staff')
  or public.has_any_role(auth.uid(), array['admin','management']::public.app_role[])
);

-- 3. fantasy_entrants: owner or admin/management only (leaderboards are served
--    through the aggregated view via privileged server code)
drop policy if exists "fantasy_entrants_select_auth" on public.fantasy_entrants;
create policy "fantasy_entrants_select_own_or_admin" on public.fantasy_entrants
for select to authenticated
using (
  user_id = auth.uid()
  or public.has_any_role(auth.uid(), array['admin','management']::public.app_role[])
);

-- 4. public.app_credentials: replace SECURITY DEFINER view with a
--    security_invoker view over a definer function that filters rows to the
--    owner or admin/management.
create or replace function public.app_credentials_visible()
returns table (
  id uuid,
  owner_id uuid,
  app_login_name text,
  expiry_at timestamptz,
  password text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid,
  account_type text,
  account_number integer
)
language sql
stable
security definer
set search_path = private, public, extensions, pg_catalog
as $$
  select c.id,
         c.owner_id,
         c.app_login_name,
         c.expiry_at,
         private.app_decrypt(c.password_enc),
         private.app_decrypt(c.notes_enc),
         c.created_at,
         c.updated_at,
         c.created_by,
         c.account_type,
         c.account_number
  from private.app_credentials c
  where c.owner_id = auth.uid()
     or public.has_any_role(auth.uid(), array['admin','management']::public.app_role[]);
$$;

revoke all on function public.app_credentials_visible() from public;
grant execute on function public.app_credentials_visible() to authenticated, service_role;

drop view if exists public.app_credentials;

create view public.app_credentials
with (security_invoker = true) as
select id, owner_id, app_login_name, expiry_at, password, notes,
       created_at, updated_at, created_by, account_type, account_number
from public.app_credentials_visible();

grant select, insert, update, delete on public.app_credentials to authenticated;
grant all on public.app_credentials to service_role;

create trigger app_credentials_iud
instead of insert or update or delete on public.app_credentials
for each row execute function public.tg_app_credentials_iud();