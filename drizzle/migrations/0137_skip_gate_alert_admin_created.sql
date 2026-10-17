CREATE OR REPLACE FUNCTION public.is_admin_created_user(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select coalesce((select (raw_user_meta_data->>'admin_created')::boolean from auth.users where id = _uid), false)
$$;
REVOKE EXECUTE ON FUNCTION public.is_admin_created_user(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.notify_new_gate_application()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare uname text;
declare has_referral boolean;
begin
  if public.is_admin_created_user(new.user_id) then return new; end if;
  select exists (
    select 1 from public.signup_info
    where user_id = new.user_id and referrer is not null and btrim(referrer) <> ''
  ) into has_referral;
  if has_referral then return new; end if;
  select coalesce(display_name, username, 'New user') into uname from public.profiles where id = new.user_id;
  insert into public.staff_notifications (kind, title, body, link_path, entity_id)
  values ('gate_application', 'New access request', uname || ' is requesting access', '/moderation', new.id);
  return new;
end;
$function$;