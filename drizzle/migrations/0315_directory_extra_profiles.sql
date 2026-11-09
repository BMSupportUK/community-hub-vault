CREATE OR REPLACE FUNCTION public.directory_extra_profiles()
RETURNS TABLE(credential_id uuid, owner_id uuid, app_login_name text, account_number integer, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'private','public'
AS $$
  select c.id, c.owner_id, c.app_login_name,
    case when public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'management')
              or public.has_role(auth.uid(),'staff') or public.has_role(auth.uid(),'moderator')
         then c.account_number else null end,
    c.created_at
  from private.app_credentials c
  where auth.uid() is not null
    and c.owner_id is not null
    and coalesce(c.account_number,1) >= 2
    and c.app_login_name is not null
  order by c.created_at desc
$$;
REVOKE EXECUTE ON FUNCTION public.directory_extra_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.directory_extra_profiles() TO authenticated;