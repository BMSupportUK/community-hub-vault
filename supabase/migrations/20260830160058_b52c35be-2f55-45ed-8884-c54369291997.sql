CREATE OR REPLACE FUNCTION public.tg_gate_messages_iud()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_id uuid; v_app_owner uuid; v_uid uuid := auth.uid();
  v_sender_name text; v_link text; v_mention text; v_mentioned uuid;
  v_is_all boolean; v_is_here boolean;
begin
  if (tg_op = 'INSERT') then
    select user_id into v_app_owner from public.gate_applications where id = new.application_id;
    if not (
      (v_uid is not null and new.sender_id = v_uid
        and (v_app_owner = v_uid
             or public.has_any_role(v_uid, array['admin','management','moderator']::public.app_role[])))
      or (v_uid is null and new.sender_id = v_app_owner)
    ) then
      raise exception 'Not authorized';
    end if;
    v_id := coalesce(new.id, gen_random_uuid());
    insert into private.gate_messages (id, application_id, sender_id, content_enc, created_at)
    values (v_id, new.application_id, new.sender_id, public.app_encrypt(new.content), coalesce(new.created_at, now()));
    new.id := v_id; new.created_at := coalesce(new.created_at, now());

    select coalesce(display_name, username, 'Applicant') into v_sender_name
      from public.profiles where id = new.sender_id;
    v_link := '/moderation';

    -- Alert staff when the applicant replies, so it reaches them anywhere in the app.
    if new.sender_id = v_app_owner then
      insert into public.staff_notifications (kind, title, body, link_path, entity_id)
      values (
        'gate_message',
        'New access chat reply from ' || coalesce(v_sender_name, 'Applicant'),
        left(new.content, 200),
        v_link,
        new.application_id
      );
    end if;

    -- @mentions
    v_is_all := new.content ~* '(^|\s)@all\b';
    v_is_here := new.content ~* '(^|\s)@here\b';
    if v_is_all or v_is_here then
      insert into public.user_notifications (user_id, kind, title, body, link_path, source_type, source_id)
      select distinct ur.user_id, 'mention',
        coalesce(v_sender_name,'Someone') || ' mentioned ' || (case when v_is_all then '@all' else '@here' end) || ' in the access chat',
        left(new.content, 200), v_link, 'gate', v_id
      from public.user_roles ur
      where ur.role in ('admin','management','moderator')
        and ur.user_id <> new.sender_id;
    end if;

    for v_mention in select (regexp_matches(new.content, '@([a-zA-Z0-9_\.\-]+)', 'g'))[1] loop
      if lower(v_mention) in ('all','here') then continue; end if;
      if lower(v_mention) in ('admin','management','moderator','staff') then
        insert into public.user_notifications (user_id, kind, title, body, link_path, source_type, source_id)
        select distinct ur.user_id, 'mention',
          coalesce(v_sender_name,'Someone') || ' mentioned @' || lower(v_mention) || ' in the access chat',
          left(new.content, 200), v_link, 'gate', v_id
        from public.user_roles ur
        where ur.role::text = lower(v_mention)
          and ur.user_id <> new.sender_id;
        continue;
      end if;
      select id into v_mentioned from public.profiles where lower(username) = lower(v_mention) limit 1;
      if v_mentioned is null or v_mentioned = new.sender_id then continue; end if;
      insert into public.user_notifications (user_id, kind, title, body, link_path, source_type, source_id)
      values (v_mentioned, 'mention',
        coalesce(v_sender_name,'Someone') || ' mentioned you in the access chat',
        left(new.content, 200), v_link, 'gate', v_id);
    end loop;

    return new;
  elsif (tg_op = 'UPDATE') then
    raise exception 'gate_messages are immutable';
  elsif (tg_op = 'DELETE') then
    if not public.has_any_role(v_uid, array['admin','management']::public.app_role[]) then
      raise exception 'Not authorized'; end if;
    delete from private.gate_messages where id = old.id;
    return old;
  end if;
  return null;
end $function$;