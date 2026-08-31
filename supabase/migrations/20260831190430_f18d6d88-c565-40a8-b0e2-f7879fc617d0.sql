create or replace function public.member_app_logins(_user_id uuid)
returns table (
  id uuid,
  app_login_name text,
  account_type text,
  account_number int,
  expiry_at timestamptz
)
language sql
stable
security definer
set search_path = public, private
as $$
  select c.id, c.app_login_name, c.account_type, c.account_number, c.expiry_at
  from private.app_credentials c
  where c.owner_id = _user_id
    and (
      _user_id = auth.uid()
      or public.has_any_role(auth.uid(), array['admin','management','staff']::public.app_role[])
    )
  order by c.account_number nulls last, c.created_at
$$;

revoke all on function public.member_app_logins(uuid) from public;
grant execute on function public.member_app_logins(uuid) to authenticated;