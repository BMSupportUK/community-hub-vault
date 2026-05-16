
-- Replace the generic set_updated_at trigger on sports_blogs with one that
-- ignores pure sort_order changes (drag-and-drop reordering).
drop trigger if exists sports_blogs_set_updated_at on public.sports_blogs;

create or replace function public.sports_blogs_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Skip bumping updated_at if only sort_order changed (drag-to-reorder).
  if (
    new.category_id is not distinct from old.category_id
    and new.title       is not distinct from old.title
    and new.excerpt     is not distinct from old.excerpt
    and new.body        is not distinct from old.body
    and new.image_url   is not distinct from old.image_url
    and new.badge       is not distinct from old.badge
    and new.published   is not distinct from old.published
  ) then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.sports_blogs_set_updated_at() from public, anon, authenticated;

create trigger sports_blogs_set_updated_at
before update on public.sports_blogs
for each row execute function public.sports_blogs_set_updated_at();
