create policy "Staff manage guide videos"
on storage.objects for all to authenticated
using (
  bucket_id = 'guide-videos'
  and public.has_any_role(auth.uid(), array['admin','management','staff']::app_role[])
)
with check (
  bucket_id = 'guide-videos'
  and public.has_any_role(auth.uid(), array['admin','management','staff']::app_role[])
);