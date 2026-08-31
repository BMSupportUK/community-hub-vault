create or replace function public.close_ticket(_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tickets%rowtype;
begin
  select * into t from public.tickets where id = _ticket_id;
  if not found then
    raise exception 'Ticket not found';
  end if;
  if not (
    t.user_id = auth.uid()
    or has_any_role(auth.uid(), array['admin','management']::app_role[])
    or (has_any_role(auth.uid(), array['staff','moderator']::app_role[]) and not is_owner_management_category(t.category_id))
  ) then
    raise exception 'Not allowed to close this ticket';
  end if;
  update public.tickets
     set status = 'closed',
         closed_at = coalesce(closed_at, now())
   where id = _ticket_id;
end;
$$;

revoke all on function public.close_ticket(uuid) from public, anon;
grant execute on function public.close_ticket(uuid) to authenticated;