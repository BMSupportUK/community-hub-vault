create policy "Management read BM applications"
on public.staff_job_applications
for select to authenticated
using (
  public.has_role(auth.uid(), 'management')
  and exists (
    select 1 from public.staff_job_vacancies v
    where v.id = vacancy_id and v.zone = 'bm'
  )
);

create policy "Management update BM applications"
on public.staff_job_applications
for update to authenticated
using (
  public.has_role(auth.uid(), 'management')
  and exists (
    select 1 from public.staff_job_vacancies v
    where v.id = vacancy_id and v.zone = 'bm'
  )
)
with check (
  public.has_role(auth.uid(), 'management')
  and exists (
    select 1 from public.staff_job_vacancies v
    where v.id = vacancy_id and v.zone = 'bm'
  )
);

create policy "Management read BM application chat"
on public.staff_job_application_messages
for select to authenticated
using (
  public.has_role(auth.uid(), 'management')
  and exists (
    select 1 from public.staff_job_applications a
    join public.staff_job_vacancies v on v.id = a.vacancy_id
    where a.id = application_id and v.zone = 'bm'
  )
);

create policy "Management post BM application chat"
on public.staff_job_application_messages
for insert to authenticated
with check (
  public.has_role(auth.uid(), 'management')
  and sender = 'admin'
  and exists (
    select 1 from public.staff_job_applications a
    join public.staff_job_vacancies v on v.id = a.vacancy_id
    where a.id = application_id and v.zone = 'bm'
  )
);