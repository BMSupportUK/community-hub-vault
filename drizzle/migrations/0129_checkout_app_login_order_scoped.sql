CREATE OR REPLACE FUNCTION public.checkout_app_login(p_token text, p_password text)
 RETURNS TABLE(app_login_name text, password text, account_type text, expiry_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'private', 'public', 'extensions', 'pg_catalog'
AS $function$
declare
  v_order_id uuid; v_link_pw text; v_claimed uuid; v_setup timestamptz;
  v_user uuid; v_paid timestamptz; v_status text; v_created timestamptz;
begin
  select l.order_id, l.password, l.claimed_by, l.account_setup_at
    into v_order_id, v_link_pw, v_claimed, v_setup
    from public.order_checkout_links l where l.token = p_token limit 1;
  if v_order_id is null then return; end if;
  if v_claimed is null
     and upper(trim(coalesce(p_password, ''))) <> upper(trim(coalesce(v_link_pw, ''))) then
    return;
  end if;
  if v_setup is null then return; end if;
  select o.user_id, o.paid_at, o.status::text, o.created_at
    into v_user, v_paid, v_status, v_created
    from private.orders o where o.id = v_order_id;
  if v_user is null or v_paid is null or coalesce(v_status, '') = 'cancelled' then return; end if;

  -- Only the login details added or updated for this order, never older accounts.
  return query
    select c.app_login_name, private.app_decrypt(c.password_enc), c.account_type, c.expiry_at
      from private.app_credentials c
     where c.owner_id = v_user
       and coalesce(c.app_login_name, '') <> ''
       and c.password_enc is not null
       and greatest(c.created_at, c.updated_at) >= v_created
     order by c.account_number nulls last;
end;
$function$;