ALTER TABLE public.staff_job_vacancies ADD COLUMN positions_available integer NOT NULL DEFAULT 1 CHECK (positions_available BETWEEN 1 AND 100);
ALTER TABLE public.staff_job_applications ADD COLUMN access_token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24),'hex');

CREATE TABLE public.staff_job_application_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.staff_job_applications(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('admin','applicant')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.staff_job_application_messages(application_id, created_at);
GRANT SELECT, INSERT ON public.staff_job_application_messages TO authenticated;
GRANT ALL ON public.staff_job_application_messages TO service_role;
ALTER TABLE public.staff_job_application_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read application chat" ON public.staff_job_application_messages FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins post application chat" ON public.staff_job_application_messages FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') AND sender = 'admin');

CREATE OR REPLACE FUNCTION public.submit_staff_job_application_v2(_vacancy_id uuid, _zone text, _full_name text, _email text, _phone text, _experience text, _motivation text, _availability text, _consent boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE new_id uuid; tok text;
BEGIN
  new_id := public.submit_staff_job_application(_vacancy_id,_zone,_full_name,_email,_phone,_experience,_motivation,_availability,_consent);
  SELECT access_token INTO tok FROM public.staff_job_applications WHERE id = new_id;
  RETURN tok;
END; $$;
GRANT EXECUTE ON FUNCTION public.submit_staff_job_application_v2(uuid,text,text,text,text,text,text,text,boolean) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_job_application_by_token(_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a public.staff_job_applications; v public.staff_job_vacancies;
BEGIN
  IF _token IS NULL OR char_length(_token) < 40 THEN RETURN NULL; END IF;
  SELECT * INTO a FROM public.staff_job_applications WHERE access_token = _token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v FROM public.staff_job_vacancies WHERE id = a.vacancy_id;
  RETURN jsonb_build_object(
    'id', a.id, 'full_name', a.full_name, 'email', a.email, 'phone', a.phone,
    'experience', a.experience, 'motivation', a.motivation, 'availability', a.availability,
    'status', a.status, 'created_at', a.created_at, 'vacancy_title', v.title, 'zone', v.zone,
    'messages', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'sender', m.sender, 'body', m.body, 'created_at', m.created_at) ORDER BY m.created_at)
      FROM public.staff_job_application_messages m WHERE m.application_id = a.id), '[]'::jsonb));
END; $$;
GRANT EXECUTE ON FUNCTION public.get_job_application_by_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.post_job_application_message(_token text, _body text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE app_id uuid; new_id uuid;
BEGIN
  IF _token IS NULL OR char_length(_token) < 40 THEN RAISE EXCEPTION 'Application not found'; END IF;
  SELECT id INTO app_id FROM public.staff_job_applications WHERE access_token = _token;
  IF app_id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF char_length(trim(coalesce(_body,''))) = 0 OR char_length(_body) > 4000 THEN RAISE EXCEPTION 'Message must be 1-4000 characters'; END IF;
  INSERT INTO public.staff_job_application_messages(application_id, sender, body) VALUES (app_id, 'applicant', trim(_body)) RETURNING id INTO new_id;
  RETURN new_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.post_job_application_message(text,text) TO anon, authenticated;