
insert into storage.buckets (id, name, public)
values ('sports-guide-covers', 'sports-guide-covers', true)
on conflict (id) do nothing;

create policy "Sports guide covers are publicly viewable"
on storage.objects for select
using (bucket_id = 'sports-guide-covers');

create policy "Mods can upload sports guide covers"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'sports-guide-covers'
  and (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'management')
    or public.has_role(auth.uid(), 'moderator')
    or public.has_role(auth.uid(), 'staff')
  )
);

create policy "Mods can update sports guide covers"
on storage.objects for update
to authenticated
using (
  bucket_id = 'sports-guide-covers'
  and (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'management')
    or public.has_role(auth.uid(), 'moderator')
    or public.has_role(auth.uid(), 'staff')
  )
);

create policy "Mods can delete sports guide covers"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'sports-guide-covers'
  and (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'management')
    or public.has_role(auth.uid(), 'moderator')
    or public.has_role(auth.uid(), 'staff')
  )
);
