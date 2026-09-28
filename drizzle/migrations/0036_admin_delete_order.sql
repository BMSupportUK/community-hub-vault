create or replace function public.admin_delete_order(_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare n_tickets int;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden: admin only';
  end if;
  delete from public.ticket_messages where ticket_id in (select id from public.tickets where order_id = _order_id);
  delete from public.tickets where order_id = _order_id;
  get diagnostics n_tickets = row_count;
  delete from public.order_invoices where order_id = _order_id;
  delete from public.order_items where order_id = _order_id;
  delete from public.order_messages where order_id = _order_id;
  delete from public.order_payments where order_id = _order_id;
  update public.wise_email_payments set matched_order_id = null where matched_order_id = _order_id;
  delete from private.orders where id = _order_id;
  if not found then raise exception 'Order not found'; end if;
  return jsonb_build_object('deleted', true, 'ticketsDeleted', n_tickets);
end $$;
revoke all on function public.admin_delete_order(uuid) from public, anon;
grant execute on function public.admin_delete_order(uuid) to authenticated;