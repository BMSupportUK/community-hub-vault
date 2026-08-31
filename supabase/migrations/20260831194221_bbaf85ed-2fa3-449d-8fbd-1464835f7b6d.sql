create or replace function public.directory_member_roles()
returns table (user_id uuid, role text)
language sql
stable
security definer
set search_path = public
as $$
  select ur.user_id, ur.role::text
  from public.user_roles ur
  where auth.uid() is not null
    and not exists (
      select 1 from public.user_roles s
      where s.user_id = ur.user_id
        and s.role in ('admin','management','moderator','staff','pending','banned')
    )
$$;

revoke all on function public.directory_member_roles() from public;
grant execute on function public.directory_member_roles() to authenticated;