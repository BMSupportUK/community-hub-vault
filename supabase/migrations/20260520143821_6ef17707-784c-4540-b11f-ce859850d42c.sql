create or replace function public.get_vpn_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (si.user_id) si.user_id
  from public.signup_info si
  where (si.is_vpn = true or si.is_proxy = true)
    and (
      public.has_any_role(auth.uid(), array['admin'::app_role,'management'::app_role,'moderator'::app_role,'staff'::app_role])
      or si.user_id = auth.uid()
    )
  order by si.user_id, si.created_at desc;
$$;

grant execute on function public.get_vpn_user_ids() to authenticated;