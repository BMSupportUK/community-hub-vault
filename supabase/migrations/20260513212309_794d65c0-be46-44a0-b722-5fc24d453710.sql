
create type public.incident_status as enum ('investigating','identified','monitoring','completed');

create table public.status_incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status public.incident_status not null default 'investigating',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.status_incident_updates (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.status_incidents(id) on delete cascade,
  status public.incident_status not null,
  message text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index status_updates_incident_idx on public.status_incident_updates(incident_id, created_at desc);

alter table public.status_incidents enable row level security;
alter table public.status_incident_updates enable row level security;

create policy "incidents read approved" on public.status_incidents for select to authenticated
using (
  not has_role(auth.uid(), 'pending'::app_role)
  and not has_role(auth.uid(), 'banned'::app_role)
);
create policy "incidents manage staff" on public.status_incidents for all to authenticated
using (has_any_role(auth.uid(), array['admin'::app_role,'management'::app_role,'staff'::app_role]))
with check (has_any_role(auth.uid(), array['admin'::app_role,'management'::app_role,'staff'::app_role]));

create policy "incident updates read approved" on public.status_incident_updates for select to authenticated
using (
  not has_role(auth.uid(), 'pending'::app_role)
  and not has_role(auth.uid(), 'banned'::app_role)
);
create policy "incident updates insert staff" on public.status_incident_updates for insert to authenticated
with check (has_any_role(auth.uid(), array['admin'::app_role,'management'::app_role,'staff'::app_role]));
create policy "incident updates manage admin" on public.status_incident_updates for delete to authenticated
using (has_any_role(auth.uid(), array['admin'::app_role,'management'::app_role,'staff'::app_role]));

create trigger status_incidents_updated before update on public.status_incidents
for each row execute function public.set_updated_at();

alter table public.status_incidents replica identity full;
alter table public.status_incident_updates replica identity full;
alter publication supabase_realtime add table public.status_incidents;
alter publication supabase_realtime add table public.status_incident_updates;
