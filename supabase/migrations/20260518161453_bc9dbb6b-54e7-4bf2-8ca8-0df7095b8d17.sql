create table if not exists public.subscription_expiry_reminders (
  id uuid primary key default gen_random_uuid(),
  credential_id uuid not null,
  kind text not null check (kind in ('7d','24h')),
  expiry_at timestamptz not null,
  recipient_email text not null,
  sent_at timestamptz not null default now(),
  unique (credential_id, kind, expiry_at)
);

alter table public.subscription_expiry_reminders enable row level security;

create policy "reminders admin read"
  on public.subscription_expiry_reminders for select
  to authenticated
  using (has_any_role(auth.uid(), array['admin'::app_role, 'management'::app_role]));

create or replace function public.get_pending_expiry_reminders(_kind text)
returns table (
  credential_id uuid,
  owner_id uuid,
  app_login_name text,
  expiry_at timestamptz,
  recipient_email text
)
language plpgsql
stable
security definer
set search_path = public, private, auth
as $$
declare
  _window_start timestamptz;
  _window_end timestamptz;
begin
  if _kind = '7d' then
    _window_start := now() + interval '6 days 23 hours';
    _window_end   := now() + interval '7 days';
  elsif _kind = '24h' then
    _window_start := now();
    _window_end   := now() + interval '24 hours';
  else
    raise exception 'invalid kind: %', _kind;
  end if;

  return query
  select c.id, c.owner_id, c.app_login_name, c.expiry_at, u.email::text
  from private.app_credentials c
  join auth.users u on u.id = c.owner_id
  where c.expiry_at is not null
    and c.expiry_at >= _window_start
    and c.expiry_at <= _window_end
    and u.email is not null
    and not has_any_role(c.owner_id, array['admin'::app_role,'management'::app_role,'staff'::app_role,'moderator'::app_role])
    and not exists (
      select 1 from public.subscription_expiry_reminders r
      where r.credential_id = c.id
        and r.kind = _kind
        and r.expiry_at = c.expiry_at
    );
end;
$$;

revoke all on function public.get_pending_expiry_reminders(text) from public, anon, authenticated;
grant execute on function public.get_pending_expiry_reminders(text) to service_role;