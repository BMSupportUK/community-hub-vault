-- Customer-facing app login details for a secure checkout order.
-- SECURITY DEFINER because it must read and decrypt the encrypted credential
-- store, which the staff-only public view never exposes to a signed-out
-- checkout visitor. It performs its own authorization: the caller must present
-- the same order token (plus the link password for manual orders) that the
-- checkout page itself uses, payment must be confirmed, the order must not be
-- cancelled, and account setup must be confirmed. Mirrors unlock() in
-- src/lib/checkout.server.ts and canViewCheckoutAppLogin().
create or replace function public.checkout_app_login(p_token text, p_password text)
returns table (app_login_name text, password text, account_type text, expiry_at timestamp with time zone)
language plpgsql
stable
security definer
set search_path = 'private', 'public', 'extensions', 'pg_catalog'
as $$
declare
  v_order_id uuid;
  v_link_pw text;
  v_claimed uuid;
  v_setup timestamptz;
  v_user uuid;
  v_paid timestamptz;
  v_status text;
begin
  select l.order_id, l.password, l.claimed_by, l.account_setup_at
    into v_order_id, v_link_pw, v_claimed, v_setup
    from public.order_checkout_links l
    where l.token = p_token
    limit 1;

  if v_order_id is null then return; end if;

  -- Manual orders are password-gated; shop-order links (claimed_by set) are link-only.
  if v_claimed is null
     and upper(trim(coalesce(p_password, ''))) <> upper(trim(coalesce(v_link_pw, ''))) then
    return;
  end if;

  -- Login details are only released once the team has confirmed account setup.
  if v_setup is null then return; end if;

  select o.user_id, o.paid_at, o.status::text
    into v_user, v_paid, v_status
    from private.orders o
    where o.id = v_order_id;

  if v_user is null or v_paid is null or coalesce(v_status, '') = 'cancelled' then return; end if;

  return query
    select c.app_login_name,
           private.app_decrypt(c.password_enc),
           c.account_type,
           c.expiry_at
      from private.app_credentials c
     where c.owner_id = v_user
       and coalesce(c.app_login_name, '') <> ''
       and c.password_enc is not null
     order by c.account_number nulls last;
end;
$$;

revoke all on function public.checkout_app_login(text, text) from public;
grant execute on function public.checkout_app_login(text, text) to anon, authenticated, service_role;