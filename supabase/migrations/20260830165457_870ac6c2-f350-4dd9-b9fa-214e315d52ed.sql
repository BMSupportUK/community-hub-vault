create or replace function public.notify_ticket_assignee_of_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  who text;
begin
  if new.is_internal then
    return new;
  end if;

  select id, user_id, subject, assigned_to into t from public.tickets where id = new.ticket_id;
  if t is null or t.assigned_to is null then
    return new;
  end if;
  -- only notify when the customer (ticket owner) replies, and never self-notify
  if new.sender_id is distinct from t.user_id or t.assigned_to = new.sender_id then
    return new;
  end if;

  select coalesce(display_name, username, 'The customer') into who
  from public.profiles where id = new.sender_id;

  insert into public.user_notifications (user_id, kind, title, body, link_path, source_type, source_id)
  values (
    t.assigned_to,
    'ticket_reply',
    coalesce(who, 'The customer') || ' replied to a ticket',
    coalesce(nullif(t.subject, ''), 'Support ticket') || ' — ' || left(coalesce(new.content, ''), 140),
    '/tickets?id=' || t.id::text,
    'ticket',
    t.id
  );

  return new;
end;
$$;

drop trigger if exists ticket_notify_assignee_reply on public.ticket_messages;
create trigger ticket_notify_assignee_reply
after insert on public.ticket_messages
for each row execute function public.notify_ticket_assignee_of_reply();