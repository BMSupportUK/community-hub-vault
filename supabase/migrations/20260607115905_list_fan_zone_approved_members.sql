create or replace function public.list_fan_zone_approved_members()
returns table (
  user_id uuid,
  status text,
  requested_at timestamptz,
  decided_at timestamptz,
  display_name text,
  username text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, m.status::text, m.requested_at, m.decided_at,
         p.display_name, p.username, p.avatar_url
  from public.fan_zone_members m
  left join public.profiles p on p.id = m.user_id
  where m.status = 'approved'
    and (
      public.is_fan_zone_member(auth.uid())
      or public.has_any_role(auth.uid(), array['admin'::app_role, 'management'::app_role, 'boro_fan_zone_moderator'::app_role])
    )
  order by m.decided_at desc nulls last, m.requested_at desc;
$$;

grant execute on function public.list_fan_zone_approved_members() to authenticated;
