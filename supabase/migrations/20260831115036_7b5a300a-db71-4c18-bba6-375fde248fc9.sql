create or replace function public.tg_notify_assignee_of_customer_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  who text;
  preview text;
  dupe uuid;
begin
  if coalesce(NEW.is_internal, false) then
    return NEW;
  end if;

  select id, user_id, subject, assigned_to into t
  from public.tickets where id = NEW.ticket_id;

  if t.id is null or t.assigned_to is null then
    return NEW;
  end if;
  -- only when the ticket owner (the customer) posts
  if NEW.sender_id is distinct from t.user_id then
    return NEW;
  end if;
  if t.assigned_to = NEW.sender_id then
    return NEW;
  end if;

  select id into dupe
  from public.user_notifications
  where user_id = t.assigned_to
    and kind = 'ticket_reply'
    and source_id = t.id
    and created_at > now() - interval '20 seconds'
  limit 1;
  if dupe is not null then
    return NEW;
  end if;

  select coalesce(p.display_name, p.username, 'The customer') into who
  from public.profiles p where p.id = NEW.sender_id;

  preview := left(coalesce(NEW.content, ''), 140);

  insert into public.user_notifications (user_id, kind, title, body, link_path, source_type, source_id)
  values (
    t.assigned_to,
    'ticket_reply',
    coalesce(who, 'The customer') || ' replied to a ticket',
    case when preview <> '' then coalesce(t.subject, 'your ticket') || ' — ' || preview else coalesce(t.subject, 'your ticket') end,
    '/tickets?id=' || t.id::text || '&view=assigned',
    'ticket',
    t.id
  );

  return NEW;
end;
$$;

drop trigger if exists trg_notify_assignee_of_customer_reply on public.ticket_messages;
create trigger trg_notify_assignee_of_customer_reply
after insert on public.ticket_messages
for each row execute function public.tg_notify_assignee_of_customer_reply();