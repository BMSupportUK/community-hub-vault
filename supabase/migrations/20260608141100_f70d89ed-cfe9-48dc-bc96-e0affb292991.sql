create or replace function public.list_fan_zone_approved_members()
returns table (
  user_id uuid,
  status text,
  requested_at timestamptz,
  decided_at timestamptz,
  fan_alias text,
  fan_avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.user_id,
    m.status::text,
    m.requested_at,
    m.decided_at,
    coalesce(nullif(m.fan_alias, ''), 'Boro Fan') as fan_alias,
    coalesce(nullif(m.fan_avatar_url, ''), public.fan_zone_default_avatar_url()) as fan_avatar_url
  from public.fan_zone_members m
  where m.status = 'approved'
    and (
      public.is_fan_zone_member(auth.uid())
      or public.has_any_role(auth.uid(), array['admin'::app_role, 'management'::app_role, 'boro_fan_zone_moderator'::app_role])
    )
  order by m.decided_at desc nulls last, m.requested_at desc;
$$;

grant execute on function public.list_fan_zone_approved_members() to authenticated;