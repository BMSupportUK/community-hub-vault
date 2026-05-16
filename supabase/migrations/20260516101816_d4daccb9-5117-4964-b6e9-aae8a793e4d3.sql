insert into storage.buckets (id, name, public)
values ('credentials-backups', 'credentials-backups', false)
on conflict (id) do nothing;

create policy "credentials-backups admin read"
on storage.objects for select to authenticated
using (
  bucket_id = 'credentials-backups'
  and public.has_any_role(auth.uid(), array['admin','management']::public.app_role[])
);