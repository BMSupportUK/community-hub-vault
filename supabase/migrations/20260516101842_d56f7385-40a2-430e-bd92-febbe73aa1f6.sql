create or replace function public.export_app_credentials_for_backup()
returns table (
  id uuid,
  owner_id uuid,
  app_login_name text,
  expiry_at timestamptz,
  password text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid
)
language sql
security definer
set search_path = public, private, extensions, pg_catalog
as $$
  select c.id, c.owner_id, c.app_login_name, c.expiry_at,
         private.app_decrypt(c.password_enc) as password,
         private.app_decrypt(c.notes_enc) as notes,
         c.created_at, c.updated_at, c.created_by
  from private.app_credentials c
  order by c.created_at asc;
$$;

revoke all on function public.export_app_credentials_for_backup() from public, anon, authenticated;
grant execute on function public.export_app_credentials_for_backup() to service_role;