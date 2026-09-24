alter table public.vault_pins add column if not exists pin_enc bytea, add column if not exists issued_by uuid, add column if not exists issued_at timestamptz;

create table public.staff_pin_reset_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  status text not null default 'pending',
  reason text,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);
grant select on public.staff_pin_reset_requests to authenticated;
grant all on public.staff_pin_reset_requests to service_role;
alter table public.staff_pin_reset_requests enable row level security;
create policy "own or admin read pin resets" on public.staff_pin_reset_requests for select to authenticated
  using (user_id = auth.uid() or public.has_any_role(auth.uid(), array['admin'::app_role,'management'::app_role]));

create or replace function public.staff_pin_set(p_user uuid, p_pin text, p_by uuid)
returns void language plpgsql security definer set search_path = public, extensions, pg_catalog as $$
begin
  insert into public.vault_pins(user_id, pin_hash, pin_enc, must_change, issued_by, issued_at, updated_at)
  values (p_user, encode(extensions.digest(p_user::text || ':' || p_pin, 'sha256'), 'hex'), public.app_encrypt(p_pin), false, p_by, now(), now())
  on conflict (user_id) do update set pin_hash = excluded.pin_hash, pin_enc = excluded.pin_enc, must_change = false,
    issued_by = excluded.issued_by, issued_at = now(), updated_at = now();
end $$;
revoke all on function public.staff_pin_set(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.staff_pin_set(uuid, text, uuid) to service_role;

create or replace function public.staff_pin_reveal(p_user uuid)
returns text language sql security definer set search_path = public, private, pg_catalog as $$
  select private.app_decrypt(pin_enc) from public.vault_pins where user_id = p_user
$$;
revoke all on function public.staff_pin_reveal(uuid) from public, anon, authenticated;
grant execute on function public.staff_pin_reveal(uuid) to service_role;

create or replace function public.staff_pin_check(p_user uuid, p_pin text)
returns boolean language sql security definer set search_path = public, extensions, pg_catalog as $$
  select exists (select 1 from public.vault_pins where user_id = p_user
    and pin_hash = encode(extensions.digest(p_user::text || ':' || p_pin, 'sha256'), 'hex'))
$$;
revoke all on function public.staff_pin_check(uuid, text) from public, anon, authenticated;
grant execute on function public.staff_pin_check(uuid, text) to service_role;