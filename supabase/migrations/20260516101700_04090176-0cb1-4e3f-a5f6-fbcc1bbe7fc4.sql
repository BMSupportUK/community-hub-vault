insert into storage.buckets (id, name, public)
values ('order-backups', 'order-backups', false)
on conflict (id) do nothing;

create policy "order-backups admin read"
on storage.objects for select to authenticated
using (
  bucket_id = 'order-backups'
  and public.has_any_role(auth.uid(), array['admin','management']::public.app_role[])
);

create policy "order-backups admin list"
on storage.objects for select to authenticated
using (
  bucket_id = 'order-backups'
  and public.has_any_role(auth.uid(), array['admin','management']::public.app_role[])
);