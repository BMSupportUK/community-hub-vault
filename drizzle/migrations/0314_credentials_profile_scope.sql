CREATE OR REPLACE FUNCTION public.app_credentials_visible()
 RETURNS TABLE(id uuid, owner_id uuid, app_login_name text, expiry_at timestamp with time zone, password text, notes text, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid, account_type text, account_number integer)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'private', 'public', 'extensions', 'pg_catalog'
AS $function$
  select c.id, c.owner_id, c.app_login_name, c.expiry_at,
         private.app_decrypt(c.password_enc), private.app_decrypt(c.notes_enc),
         c.created_at, c.updated_at, c.created_by, c.account_type, c.account_number
  from private.app_credentials c
  where (c.owner_id = auth.uid() and c.id = public.active_profile_credential())
     or public.has_any_role(auth.uid(), array['admin','management','staff']::public.app_role[]);
$function$;

CREATE OR REPLACE FUNCTION public.my_account_profiles()
 RETURNS TABLE(id uuid, app_login_name text, account_number integer, account_type text, expiry_at timestamptz, player_number integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'private','public'
AS $$
  select c.id, c.app_login_name, c.account_number, c.account_type, c.expiry_at, c.player_number
  from private.app_credentials c where c.owner_id = auth.uid()
  order by c.account_number nulls last, c.created_at
$$;
REVOKE EXECUTE ON FUNCTION public.my_account_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_account_profiles() TO authenticated;