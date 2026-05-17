create table public.mfa_reset_log (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null,
  reset_by uuid not null,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.mfa_reset_log enable row level security;
create policy "admins_read_mfa_reset_log" on public.mfa_reset_log for select
  using (public.has_any_role(auth.uid(), array['admin','management']::app_role[]));
create policy "admins_insert_mfa_reset_log" on public.mfa_reset_log for insert
  with check (public.has_any_role(auth.uid(), array['admin','management']::app_role[]));
create index idx_mfa_reset_log_target on public.mfa_reset_log(target_user_id);