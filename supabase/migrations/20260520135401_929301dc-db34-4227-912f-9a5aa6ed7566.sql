-- Fix avatars bucket RLS: use prefix match instead of storage.foldername,
-- and explicitly require an authenticated session.

drop policy if exists "avatars user upload" on storage.objects;
drop policy if exists "avatars user update" on storage.objects;
drop policy if exists "avatars user delete" on storage.objects;

create policy "avatars user upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and auth.uid() is not null
  and name like (auth.uid()::text || '/%')
);

create policy "avatars user update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid() is not null
  and name like (auth.uid()::text || '/%')
)
with check (
  bucket_id = 'avatars'
  and auth.uid() is not null
  and name like (auth.uid()::text || '/%')
);

create policy "avatars user delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid() is not null
  and name like (auth.uid()::text || '/%')
);

-- Ensure public read on avatars (bucket is public, but keep an explicit policy).
drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read"
on storage.objects
for select
to public
using (bucket_id = 'avatars');