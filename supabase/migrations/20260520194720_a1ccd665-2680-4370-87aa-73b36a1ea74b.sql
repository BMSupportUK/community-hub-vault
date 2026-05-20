grant select on private.orders to authenticated;
alter table private.orders replica identity full;