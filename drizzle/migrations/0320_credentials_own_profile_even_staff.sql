CREATE OR REPLACE FUNCTION public.app_credentials_visible()
 RETURNS TABLE(id uuid, owner_id uuid, app_login_name text, expiry_at timestamp with time zone, password text, notes text, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid, account_type text, account_number integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'private', 'public', 'extensions', 'pg_catalog'
AS $function$
  select c.id, c.owner_id, c.app_login_name, c.expiry_at,
         private.app_decrypt(c.password_enc), private.app_decrypt(c.notes_enc),
         c.created_at, c.updated_at, c.created_by, c.account_type, c.account_number
  from private.app_credentials c
  where (c.owner_id = auth.uid() and c.id = public.active_profile_credential())
     or (c.owner_id is distinct from auth.uid()
         and public.has_any_role(auth.uid(), array['admin','management','staff']::public.app_role[]));
$function$;