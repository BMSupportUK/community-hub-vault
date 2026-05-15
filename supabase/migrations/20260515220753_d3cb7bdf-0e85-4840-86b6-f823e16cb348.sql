
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to postgres;

create table if not exists private.encryption_keys (
  name text primary key,
  key text not null,
  created_at timestamptz not null default now()
);

insert into private.encryption_keys (name, key)
select 'app_default', encode(extensions.gen_random_bytes(32), 'hex')
where not exists (select 1 from private.encryption_keys where name = 'app_default');

create or replace function private.get_enc_key() returns text
language sql security definer set search_path = private, pg_catalog as $$
  select key from private.encryption_keys where name = 'app_default'
$$;
revoke all on function private.get_enc_key() from public, anon, authenticated;

create or replace function public.app_encrypt(p text) returns bytea
language plpgsql security definer set search_path = private, extensions, pg_catalog as $$
begin
  if p is null then return null; end if;
  return extensions.pgp_sym_encrypt(p, private.get_enc_key());
end $$;
grant execute on function public.app_encrypt(text) to authenticated;

create or replace function private.app_decrypt(c bytea) returns text
language plpgsql security definer set search_path = private, extensions, pg_catalog as $$
begin
  if c is null then return null; end if;
  return extensions.pgp_sym_decrypt(c, private.get_enc_key());
exception when others then
  return null;
end $$;
revoke all on function private.app_decrypt(bytea) from public, anon, authenticated;

-- =====================================================
-- 1. app_credentials
-- =====================================================
alter table public.app_credentials add column if not exists password_enc bytea;
alter table public.app_credentials add column if not exists notes_enc bytea;
update public.app_credentials
   set password_enc = public.app_encrypt(password),
       notes_enc    = public.app_encrypt(notes)
 where password_enc is null;
alter table public.app_credentials drop column password;
alter table public.app_credentials drop column notes;
alter table public.app_credentials set schema private;

create or replace view public.app_credentials with (security_invoker = true) as
select
  id, owner_id, app_login_name, expiry_at,
  case
    when owner_id = auth.uid()
      or public.has_any_role(auth.uid(), array['admin','management']::public.app_role[])
    then private.app_decrypt(password_enc) else null end as password,
  case
    when owner_id = auth.uid()
      or public.has_any_role(auth.uid(), array['admin','management']::public.app_role[])
    then private.app_decrypt(notes_enc) else null end as notes,
  created_at, updated_at, created_by
from private.app_credentials;

grant select, insert, update, delete on public.app_credentials to authenticated;

create or replace function public.tg_app_credentials_iud() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare v_id uuid;
begin
  if not public.has_any_role(auth.uid(), array['admin','management']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;
  if (tg_op = 'INSERT') then
    v_id := coalesce(new.id, gen_random_uuid());
    insert into private.app_credentials
      (id, owner_id, app_login_name, password_enc, notes_enc, expiry_at, created_by, created_at, updated_at)
    values (v_id, new.owner_id, new.app_login_name,
            public.app_encrypt(new.password), public.app_encrypt(new.notes),
            new.expiry_at, coalesce(new.created_by, auth.uid()), now(), now());
    new.id := v_id; new.created_at := now(); new.updated_at := now();
    return new;
  elsif (tg_op = 'UPDATE') then
    update private.app_credentials set
      owner_id = new.owner_id,
      app_login_name = new.app_login_name,
      password_enc = case when new.password is distinct from old.password
                          then public.app_encrypt(new.password) else password_enc end,
      notes_enc    = case when new.notes is distinct from old.notes
                          then public.app_encrypt(new.notes) else notes_enc end,
      expiry_at = new.expiry_at,
      updated_at = now()
    where id = old.id;
    new.updated_at := now();
    return new;
  elsif (tg_op = 'DELETE') then
    delete from private.app_credentials where id = old.id;
    return old;
  end if;
  return null;
end $$;

drop trigger if exists app_credentials_iud on public.app_credentials;
create trigger app_credentials_iud instead of insert or update or delete on public.app_credentials
for each row execute function public.tg_app_credentials_iud();

-- =====================================================
-- 2. user_ip_logs
-- =====================================================
alter table public.user_ip_logs add column if not exists ip_enc bytea;
alter table public.user_ip_logs add column if not exists user_agent_enc bytea;
update public.user_ip_logs
   set ip_enc = public.app_encrypt(ip),
       user_agent_enc = public.app_encrypt(user_agent)
 where ip_enc is null;
alter table public.user_ip_logs drop column ip;
alter table public.user_ip_logs drop column user_agent;
alter table public.user_ip_logs set schema private;

create or replace view public.user_ip_logs with (security_invoker = true) as
select id, user_id,
  case when public.has_any_role(auth.uid(), array['admin','management','moderator']::public.app_role[])
       then private.app_decrypt(ip_enc) else null end as ip,
  case when public.has_any_role(auth.uid(), array['admin','management','moderator']::public.app_role[])
       then private.app_decrypt(user_agent_enc) else null end as user_agent,
  created_at
from private.user_ip_logs;

grant select, insert, update, delete on public.user_ip_logs to authenticated;

create or replace function public.tg_user_ip_logs_iud() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare v_id uuid;
begin
  if (tg_op = 'INSERT') then
    if new.user_id is distinct from auth.uid()
       and not public.has_any_role(auth.uid(), array['admin','management']::public.app_role[]) then
      raise exception 'Not authorized';
    end if;
    v_id := coalesce(new.id, gen_random_uuid());
    insert into private.user_ip_logs (id, user_id, ip_enc, user_agent_enc, created_at)
    values (v_id, new.user_id, public.app_encrypt(new.ip), public.app_encrypt(new.user_agent), coalesce(new.created_at, now()));
    new.id := v_id; new.created_at := coalesce(new.created_at, now());
    return new;
  elsif (tg_op = 'UPDATE') then
    if not public.has_any_role(auth.uid(), array['admin','management']::public.app_role[]) then
      raise exception 'Not authorized'; end if;
    update private.user_ip_logs set
      user_id = new.user_id,
      ip_enc = case when new.ip is distinct from old.ip then public.app_encrypt(new.ip) else ip_enc end,
      user_agent_enc = case when new.user_agent is distinct from old.user_agent then public.app_encrypt(new.user_agent) else user_agent_enc end
    where id = old.id;
    return new;
  elsif (tg_op = 'DELETE') then
    if not public.has_any_role(auth.uid(), array['admin','management']::public.app_role[]) then
      raise exception 'Not authorized'; end if;
    delete from private.user_ip_logs where id = old.id;
    return old;
  end if;
  return null;
end $$;

drop trigger if exists user_ip_logs_iud on public.user_ip_logs;
create trigger user_ip_logs_iud instead of insert or update or delete on public.user_ip_logs
for each row execute function public.tg_user_ip_logs_iud();

-- =====================================================
-- 3. orders
-- =====================================================
drop trigger if exists notify_new_order_trg on public.orders;
drop trigger if exists grant_subscriber_on_completed_order_trg on public.orders;

alter table public.orders add column if not exists shipping_address_enc bytea;
alter table public.orders add column if not exists email_enc bytea;
update public.orders
   set shipping_address_enc = public.app_encrypt(shipping_address),
       email_enc = public.app_encrypt(email)
 where shipping_address_enc is null and (shipping_address is not null or email is not null);
alter table public.orders drop column shipping_address;
alter table public.orders drop column email;
alter table public.orders set schema private;

create trigger notify_new_order_trg
after insert on private.orders
for each row execute function public.notify_new_order();

create trigger grant_subscriber_on_completed_order_trg
after update on private.orders
for each row execute function public.grant_subscriber_on_completed_order();

create or replace view public.orders with (security_invoker = true) as
select
  id, user_id, status, total_cents, discount_cents, discount_code,
  shipping_name, customer_type, existing_username, notes,
  case when user_id = auth.uid()
        or public.has_any_role(auth.uid(), array['admin','management']::public.app_role[])
       then private.app_decrypt(shipping_address_enc) else null end as shipping_address,
  case when user_id = auth.uid()
        or public.has_any_role(auth.uid(), array['admin','management']::public.app_role[])
       then private.app_decrypt(email_enc) else null end as email,
  paid_at, paid_by, completed_at, completed_by, created_at, updated_at
from private.orders;

grant select, insert, update, delete on public.orders to authenticated;

create or replace function public.tg_orders_iud() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare v_id uuid;
begin
  if (tg_op = 'INSERT') then
    if new.user_id is distinct from auth.uid() then
      raise exception 'Not authorized'; end if;
    v_id := coalesce(new.id, gen_random_uuid());
    insert into private.orders
      (id, user_id, status, total_cents, discount_cents, discount_code, shipping_name,
       customer_type, existing_username, notes, shipping_address_enc, email_enc,
       paid_at, paid_by, completed_at, completed_by, created_at, updated_at)
    values (v_id, new.user_id, coalesce(new.status, 'pending'::order_status),
       coalesce(new.total_cents, 0), coalesce(new.discount_cents, 0), new.discount_code,
       new.shipping_name, new.customer_type, new.existing_username, new.notes,
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
end $$;

drop trigger if exists orders_iud on public.orders;
create trigger orders_iud instead of insert or update or delete on public.orders
for each row execute function public.tg_orders_iud();

-- =====================================================
-- 4. gate_messages
-- =====================================================
alter table public.gate_messages add column if not exists content_enc bytea;
update public.gate_messages set content_enc = public.app_encrypt(content) where content_enc is null;
alter table public.gate_messages drop column content;
alter table public.gate_messages set schema private;

create or replace view public.gate_messages with (security_invoker = true) as
select m.id, m.application_id, m.sender_id, m.created_at,
  case when m.sender_id = auth.uid()
        or public.has_any_role(auth.uid(), array['admin','management','moderator']::public.app_role[])
        or exists (select 1 from public.gate_applications a where a.id = m.application_id and a.user_id = auth.uid())
       then private.app_decrypt(m.content_enc) else null end as content
from private.gate_messages m;

grant select, insert, update, delete on public.gate_messages to authenticated;

create or replace function public.tg_gate_messages_iud() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare v_id uuid; v_app_owner uuid; v_uid uuid := auth.uid();
begin
  if (tg_op = 'INSERT') then
    select user_id into v_app_owner from public.gate_applications where id = new.application_id;
    if not (
      (v_uid is not null and new.sender_id = v_uid
        and (v_app_owner = v_uid
             or public.has_any_role(v_uid, array['admin','management','moderator']::public.app_role[])))
      or (v_uid is null and new.sender_id = v_app_owner)
    ) then
      raise exception 'Not authorized';
    end if;
    v_id := coalesce(new.id, gen_random_uuid());
    insert into private.gate_messages (id, application_id, sender_id, content_enc, created_at)
    values (v_id, new.application_id, new.sender_id, public.app_encrypt(new.content), coalesce(new.created_at, now()));
    new.id := v_id; new.created_at := coalesce(new.created_at, now());
    return new;
  elsif (tg_op = 'UPDATE') then
    raise exception 'gate_messages are immutable';
  elsif (tg_op = 'DELETE') then
    if not public.has_any_role(v_uid, array['admin','management']::public.app_role[]) then
      raise exception 'Not authorized'; end if;
    delete from private.gate_messages where id = old.id;
    return old;
  end if;
  return null;
end $$;

drop trigger if exists gate_messages_iud on public.gate_messages;
create trigger gate_messages_iud instead of insert or update or delete on public.gate_messages
for each row execute function public.tg_gate_messages_iud();

-- Realtime publication: swap public -> private for moved tables
do $$ begin
  begin execute 'alter publication supabase_realtime drop table public.orders'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime drop table public.gate_messages'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table private.orders'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table private.gate_messages'; exception when others then null; end;
end $$;
