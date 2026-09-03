create or replace function public.notify_owner_fan_zone_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if new.status <> 'pending' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'pending' then
    return new;
  end if;

  select coalesce(p.display_name, p.username, 'New member') into v_name
  from public.profiles p where p.id = new.user_id;

  insert into public.staff_notifications (kind, title, body, link_path, entity_id)
  values (
    'fan_zone_signup',
    'Boro Fan Zone access request',
    coalesce(v_name, 'New member') || ' has signed up for the Boro Fan Zone and is waiting for approval.',
    '/admin-fan-zone',
    new.user_id
  );
  return new;
end;
$$;

revoke all on function public.notify_owner_fan_zone_request() from public, anon, authenticated;

drop trigger if exists fan_zone_members_notify_owner on public.fan_zone_members;
create trigger fan_zone_members_notify_owner
after insert or update of status on public.fan_zone_members
for each row execute function public.notify_owner_fan_zone_request();