CREATE OR REPLACE FUNCTION public.gate_alert_suppressed(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  select public.is_admin_created_user(_uid)
    or exists (select 1 from public.manually_added_customers m where m.user_id = _uid)
    or exists (select 1 from public.signup_info s where s.user_id = _uid and s.referrer is not null and btrim(s.referrer) <> '')
    or exists (
      select 1 from auth.users u
      join private.orders o on lower(btrim(private.app_decrypt(o.email_enc))) = lower(btrim(u.email))
      join public.order_checkout_links l on l.order_id = o.id
      where u.id = _uid and o.status::text <> 'cancelled'
    )
$$;
REVOKE EXECUTE ON FUNCTION public.gate_alert_suppressed(uuid) FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public.notify_new_gate_application()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare uname text;
begin
  if public.gate_alert_suppressed(new.user_id) then return new; end if;
  select coalesce(display_name, username, 'New user') into uname from public.profiles where id = new.user_id;
  insert into public.staff_notifications (kind, title, body, link_path, entity_id)
  values ('gate_application', 'New access request', uname || ' is requesting access', '/moderation', new.id);
  return new;
end;
$function$;

DO $patch$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.tg_gate_messages_iud'::regproc);
  IF position('    if new.sender_id = v_app_owner then
      insert into public.staff_notifications' IN d) = 0 THEN
    RAISE EXCEPTION 'gate message trigger definition changed';
  END IF;
  -- The automatic signup greeting (no signed-in sender) never alerts staff;
  -- genuine signups are already covered by the access-request alert.
  d := replace(d, '    if new.sender_id = v_app_owner then
      insert into public.staff_notifications',
    '    if new.sender_id = v_app_owner and v_uid is not null then
      insert into public.staff_notifications');
  EXECUTE d;
END $patch$;

DELETE FROM public.staff_notifications n
 USING public.gate_applications g
 WHERE n.kind IN ('gate_message','gate_application') AND n.entity_id = g.id
   AND n.created_at > now() - interval '3 days'
   AND public.gate_alert_suppressed(g.user_id);