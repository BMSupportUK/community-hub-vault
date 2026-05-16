create or replace function public.restore_app_credentials_from_backup(
  p_snapshot jsonb,
  p_mode text default 'merge'
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'private', 'extensions', 'pg_catalog'
as $$
declare
  v_items jsonb;
  v_item jsonb;
  v_count int := 0;
  v_inserted int := 0;
  v_updated int := 0;
begin
  if p_mode not in ('merge', 'replace') then
    raise exception 'Invalid mode: %', p_mode;
  end if;

  v_items := coalesce(p_snapshot -> 'credentials', p_snapshot);
  if jsonb_typeof(v_items) <> 'array' then
    raise exception 'Snapshot must contain a credentials array';
  end if;

  if p_mode = 'replace' then
    delete from private.app_credentials;
  end if;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_count := v_count + 1;
    if p_mode = 'replace' then
      insert into private.app_credentials
        (id, owner_id, app_login_name, password_enc, notes_enc, expiry_at, created_by, created_at, updated_at)
      values (
        coalesce((v_item->>'id')::uuid, gen_random_uuid()),
        (v_item->>'owner_id')::uuid,
        v_item->>'app_login_name',
        public.app_encrypt(v_item->>'password'),
        public.app_encrypt(v_item->>'notes'),
        nullif(v_item->>'expiry_at','')::timestamptz,
        nullif(v_item->>'created_by','')::uuid,
        coalesce(nullif(v_item->>'created_at','')::timestamptz, now()),
        now()
      );
      v_inserted := v_inserted + 1;
    else
      insert into private.app_credentials
        (id, owner_id, app_login_name, password_enc, notes_enc, expiry_at, created_by, created_at, updated_at)
      values (
        coalesce((v_item->>'id')::uuid, gen_random_uuid()),
        (v_item->>'owner_id')::uuid,
        v_item->>'app_login_name',
        public.app_encrypt(v_item->>'password'),
        public.app_encrypt(v_item->>'notes'),
        nullif(v_item->>'expiry_at','')::timestamptz,
        nullif(v_item->>'created_by','')::uuid,
        coalesce(nullif(v_item->>'created_at','')::timestamptz, now()),
        now()
      )
      on conflict (id) do update set
        owner_id = excluded.owner_id,
        app_login_name = excluded.app_login_name,
        password_enc = excluded.password_enc,
        notes_enc = excluded.notes_enc,
        expiry_at = excluded.expiry_at,
        updated_at = now();
      if found then
        v_updated := v_updated + 1;
      else
        v_inserted := v_inserted + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'mode', p_mode,
    'processed', v_count,
    'inserted', v_inserted,
    'updated', v_updated
  );
end;
$$;

revoke all on function public.restore_app_credentials_from_backup(jsonb, text) from public, anon, authenticated;
grant execute on function public.restore_app_credentials_from_backup(jsonb, text) to service_role;