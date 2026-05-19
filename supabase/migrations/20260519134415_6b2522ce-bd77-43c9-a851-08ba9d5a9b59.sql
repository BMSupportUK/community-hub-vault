create or replace function public.is_order_participant(_order_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from private.orders o
    where o.id = _order_id
      and (
        o.user_id = _user_id
        or public.has_any_role(_user_id, array['admin'::app_role, 'management'::app_role])
      )
  )
$$;

grant execute on function public.is_order_participant(uuid, uuid) to authenticated;

drop policy if exists "order_msg read participants" on public.order_messages;
create policy "order_msg read participants"
on public.order_messages
for select
to authenticated
using (public.is_order_participant(order_id, auth.uid()));

alter table public.order_messages replica identity full;