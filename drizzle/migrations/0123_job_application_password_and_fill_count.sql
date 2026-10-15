ALTER TABLE public.staff_job_applications ADD COLUMN password_hash text;
ALTER TABLE public.staff_job_vacancies ADD COLUMN positions_filled integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.recount_job_positions_filled() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.staff_job_vacancies v SET positions_filled = (SELECT count(*) FROM public.staff_job_applications a WHERE a.vacancy_id = v.id AND a.status = 'accepted')
  WHERE v.id IN (COALESCE(NEW.vacancy_id, OLD.vacancy_id), COALESCE(OLD.vacancy_id, NEW.vacancy_id));
  RETURN NULL;
END; $$;
CREATE TRIGGER staff_job_applications_recount AFTER INSERT OR DELETE OR UPDATE OF status, vacancy_id ON public.staff_job_applications FOR EACH ROW EXECUTE FUNCTION public.recount_job_positions_filled();
UPDATE public.staff_job_vacancies v SET positions_filled = (SELECT count(*) FROM public.staff_job_applications a WHERE a.vacancy_id = v.id AND a.status = 'accepted');

CREATE OR REPLACE FUNCTION public.submit_staff_job_application_v3(_vacancy_id uuid, _zone text, _full_name text, _email text, _phone text, _experience text, _motivation text, _availability text, _consent boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE new_id uuid; tok text; pw text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.staff_job_vacancies WHERE id = _vacancy_id AND positions_filled >= positions_available) THEN
    RAISE EXCEPTION 'All positions for this role have been filled.';
  END IF;
  new_id := public.submit_staff_job_application(_vacancy_id,_zone,_full_name,_email,_phone,_experience,_motivation,_availability,_consent);
  pw := upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,4)) || '-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,4)) || '-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,4));
  UPDATE public.staff_job_applications SET password_hash = extensions.crypt(pw, extensions.gen_salt('bf')) WHERE id = new_id RETURNING access_token INTO tok;
  RETURN jsonb_build_object('token', tok, 'password', pw, 'id', new_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.submit_staff_job_application_v3(uuid,text,text,text,text,text,text,text,boolean) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_staff_job_application_v2(uuid,text,text,text,text,text,text,text,boolean) FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public.job_application_id_for(_token text, _password text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
  SELECT id FROM public.staff_job_applications
  WHERE _token IS NOT NULL AND char_length(_token) >= 40 AND access_token = _token
    AND password_hash IS NOT NULL AND _password IS NOT NULL AND password_hash = extensions.crypt(_password, password_hash)
$$;
REVOKE EXECUTE ON FUNCTION public.job_application_id_for(text,text) FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public.get_job_application_secure(_token text, _password text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a public.staff_job_applications; v public.staff_job_vacancies; app_id uuid;
BEGIN
  app_id := public.job_application_id_for(_token, upper(trim(_password)));
  IF app_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO a FROM public.staff_job_applications WHERE id = app_id;
  SELECT * INTO v FROM public.staff_job_vacancies WHERE id = a.vacancy_id;
  RETURN jsonb_build_object(
    'id', a.id, 'full_name', a.full_name, 'email', a.email, 'phone', a.phone,
    'experience', a.experience, 'motivation', a.motivation, 'availability', a.availability,
    'status', a.status, 'created_at', a.created_at, 'vacancy_title', v.title, 'zone', v.zone,
    'messages', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'sender', m.sender, 'body', m.body, 'created_at', m.created_at) ORDER BY m.created_at)
      FROM public.staff_job_application_messages m WHERE m.application_id = a.id), '[]'::jsonb));
END; $$;
GRANT EXECUTE ON FUNCTION public.get_job_application_secure(text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.post_job_application_message_secure(_token text, _password text, _body text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE app_id uuid; new_id uuid;
BEGIN
  app_id := public.job_application_id_for(_token, upper(trim(_password)));
  IF app_id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF char_length(trim(coalesce(_body,''))) = 0 OR char_length(_body) > 4000 THEN RAISE EXCEPTION 'Message must be 1-4000 characters'; END IF;
  INSERT INTO public.staff_job_application_messages(application_id, sender, body) VALUES (app_id, 'applicant', trim(_body)) RETURNING id INTO new_id;
  RETURN new_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.post_job_application_message_secure(text,text,text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_job_application_by_token(text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.post_job_application_message(text,text) FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public.reset_job_application_password(_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE pw text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  pw := upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,4)) || '-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,4)) || '-' || upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,4));
  UPDATE public.staff_job_applications SET password_hash = extensions.crypt(pw, extensions.gen_salt('bf')) WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  RETURN pw;
END; $$;
REVOKE EXECUTE ON FUNCTION public.reset_job_application_password(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.reset_job_application_password(uuid) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_job_vacancies;