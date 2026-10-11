create or replace function public.notify_new_gate_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare uname text;
declare has_referral boolean;
begin
  select exists (
    select 1 from public.signup_info
    where user_id = new.user_id and referrer is not null and btrim(referrer) <> ''
  ) into has_referral;
  if has_referral then
    return new;
  end if;
  select coalesce(display_name, username, 'New user') into uname from public.profiles where id = new.user_id;
  insert into public.staff_notifications (kind, title, body, link_path, entity_id)
  values ('gate_application', 'New access request', uname || ' is requesting access', '/moderation', new.id);
  return new;
end;
$$;