ALTER TABLE public.staff_job_vacancies ADD COLUMN IF NOT EXISTS hours TEXT;
UPDATE public.staff_job_vacancies SET hours = employment_type, employment_type = '' WHERE hours IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_job_vacancies TO authenticated;
GRANT SELECT ON public.staff_job_vacancies TO anon;
GRANT ALL ON public.staff_job_vacancies TO service_role;