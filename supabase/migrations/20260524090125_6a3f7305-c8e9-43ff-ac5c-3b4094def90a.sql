
-- Public bucket for knowledge base video embeds
insert into storage.buckets (id, name, public)
values ('kb-videos', 'kb-videos', true)
on conflict (id) do nothing;

-- Public read
create policy "kb-videos public read"
on storage.objects for select
using (bucket_id = 'kb-videos');

-- Authenticated users can upload to their own folder
create policy "kb-videos authenticated upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'kb-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Authenticated users can delete their own files
create policy "kb-videos authenticated delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'kb-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
