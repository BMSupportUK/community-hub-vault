CREATE TABLE public.staff_job_vacancies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 zone text NOT NULL CHECK (zone IN ('bm','fanzone')),
 title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 150),
 location text NOT NULL DEFAULT '' CHECK (char_length(location) <= 200),
 employment_type text NOT NULL DEFAULT '' CHECK (char_length(employment_type) <= 100),
 description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 12000),
 requirements text NOT NULL DEFAULT '' CHECK (char_length(requirements) <= 12000),
 closing_date date,
 published boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staff_job_vacancies TO anon;
GRANT SELECT, INSERT, UPDATE ON public.staff_job_vacancies TO authenticated;
GRANT ALL ON public.staff_job_vacancies TO service_role;
ALTER TABLE public.staff_job_vacancies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public open vacancies" ON public.staff_job_vacancies FOR SELECT TO anon, authenticated USING (published AND (closing_date IS NULL OR closing_date >= (now() AT TIME ZONE 'Europe/London')::date));
CREATE POLICY "Admins manage vacancies" ON public.staff_job_vacancies FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TABLE public.staff_job_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 vacancy_id uuid NOT NULL REFERENCES public.staff_job_vacancies(id),
 full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 150),
 email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
 phone text NOT NULL DEFAULT '' CHECK (char_length(phone) <= 50),
 experience text NOT NULL CHECK (char_length(experience) BETWEEN 1 AND 6000),
 motivation text NOT NULL CHECK (char_length(motivation) BETWEEN 1 AND 6000),
 availability text NOT NULL CHECK (char_length(availability) BETWEEN 1 AND 1000),
 consent boolean NOT NULL CHECK (consent),
 status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','shortlisted','accepted','rejected')),
 admin_notes text NOT NULL DEFAULT '' CHECK (char_length(admin_notes) <= 6000),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.staff_job_applications TO authenticated;
GRANT ALL ON public.staff_job_applications TO service_role;
ALTER TABLE public.staff_job_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only admins review applications" ON public.staff_job_applications FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Only admins update applications" ON public.staff_job_applications FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX staff_job_applications_vacancy_idx ON public.staff_job_applications(vacancy_id, created_at DESC);
CREATE OR REPLACE FUNCTION public.submit_staff_job_application(_vacancy_id uuid, _zone text, _full_name text, _email text, _phone text, _experience text, _motivation text, _availability text, _consent boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result uuid;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.staff_job_vacancies WHERE id = _vacancy_id AND zone = _zone AND published AND (closing_date IS NULL OR closing_date >= (now() AT TIME ZONE 'Europe/London')::date) FOR SHARE) THEN
  RAISE EXCEPTION 'This position is no longer accepting applications.';
 END IF;
 IF _email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR NOT _consent OR char_length(trim(_full_name)) = 0 OR char_length(trim(_experience)) = 0 OR char_length(trim(_motivation)) = 0 OR char_length(trim(_availability)) = 0 THEN
  RAISE EXCEPTION 'Please complete the required application details.';
 END IF;
 INSERT INTO public.staff_job_applications(vacancy_id,full_name,email,phone,experience,motivation,availability,consent)
 VALUES (_vacancy_id,trim(_full_name),lower(trim(_email)),trim(_phone),trim(_experience),trim(_motivation),trim(_availability),_consent) RETURNING id INTO result;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_staff_job_application(uuid,text,text,text,text,text,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_staff_job_application(uuid,text,text,text,text,text,text,text,boolean) TO anon, authenticated, service_role;