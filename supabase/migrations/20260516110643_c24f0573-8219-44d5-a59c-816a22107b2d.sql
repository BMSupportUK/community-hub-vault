
ALTER TABLE private.orders ADD COLUMN IF NOT EXISTS wants_adult_content boolean;

CREATE OR REPLACE VIEW public.orders
WITH (security_invoker = true)
AS
 SELECT id,
    user_id,
    status,
    total_cents,
    discount_cents,
    discount_code,
    shipping_name,
    customer_type,
    existing_username,
    notes,
        CASE
            WHEN user_id = auth.uid() OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]) THEN private.app_decrypt(shipping_address_enc)
            ELSE NULL::text
        END AS shipping_address,
        CASE
            WHEN user_id = auth.uid() OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]) THEN private.app_decrypt(email_enc)
            ELSE NULL::text
        END AS email,
    paid_at,
    paid_by,
    completed_at,
    completed_by,
    created_at,
    updated_at,
    wants_adult_content
   FROM private.orders;

CREATE OR REPLACE FUNCTION public.tg_orders_iud()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare v_id uuid;
begin
  if (tg_op = 'INSERT') then
    if new.user_id is distinct from auth.uid() then
      raise exception 'Not authorized'; end if;
    v_id := coalesce(new.id, gen_random_uuid());
    insert into private.orders
      (id, user_id, status, total_cents, discount_cents, discount_code, shipping_name,
       customer_type, existing_username, notes, wants_adult_content, shipping_address_enc, email_enc,
       paid_at, paid_by, completed_at, completed_by, created_at, updated_at)
    values (v_id, new.user_id, coalesce(new.status, 'pending'::order_status),
       coalesce(new.total_cents, 0), coalesce(new.discount_cents, 0), new.discount_code,
       new.shipping_name, new.customer_type, new.existing_username, new.notes, new.wants_adult_content,
       public.app_encrypt(new.shipping_address), public.app_encrypt(new.email),
       new.paid_at, new.paid_by, new.completed_at, new.completed_by,
       coalesce(new.created_at, now()), now());
    new.id := v_id; new.created_at := coalesce(new.created_at, now()); new.updated_at := now();
    return new;
  elsif (tg_op = 'UPDATE') then
    if not (old.user_id = auth.uid()
            or public.has_any_role(auth.uid(), array['admin','management']::public.app_role[])) then
      raise exception 'Not authorized'; end if;
    update private.orders set
      status = new.status, total_cents = new.total_cents,
      discount_cents = new.discount_cents, discount_code = new.discount_code,
      shipping_name = new.shipping_name, customer_type = new.customer_type,
      existing_username = new.existing_username, notes = new.notes,
      wants_adult_content = new.wants_adult_content,
      shipping_address_enc = case when new.shipping_address is distinct from old.shipping_address
                                  then public.app_encrypt(new.shipping_address) else shipping_address_enc end,
      email_enc = case when new.email is distinct from old.email
                       then public.app_encrypt(new.email) else email_enc end,
      paid_at = new.paid_at, paid_by = new.paid_by,
      completed_at = new.completed_at, completed_by = new.completed_by,
      updated_at = now()
    where id = old.id;
    new.updated_at := now();
    return new;
  elsif (tg_op = 'DELETE') then
    if not public.has_any_role(auth.uid(), array['admin','management']::public.app_role[]) then
      raise exception 'Not authorized'; end if;
    delete from private.orders where id = old.id;
    return old;
  end if;
  return null;
end $function$;
