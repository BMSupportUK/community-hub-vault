do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'guide_passcodes'
  ) then
    alter publication supabase_realtime add table public.guide_passcodes;
  end if;
end $$;