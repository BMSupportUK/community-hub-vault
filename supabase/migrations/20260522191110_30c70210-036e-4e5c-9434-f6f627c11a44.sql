
CREATE TABLE public.contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_name_len CHECK (char_length(name) BETWEEN 1 AND 100),
  CONSTRAINT contact_email_len CHECK (char_length(email) BETWEEN 3 AND 255),
  CONSTRAINT contact_subject_len CHECK (char_length(subject) BETWEEN 1 AND 200),
  CONSTRAINT contact_message_len CHECK (char_length(message) BETWEEN 1 AND 5000)
);

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can submit contact"
  ON public.contact_submissions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "admins manage contact"
  ON public.contact_submissions FOR ALL
  TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]));
