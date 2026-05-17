CREATE TABLE public.signup_info (
  user_id uuid NOT NULL PRIMARY KEY,
  ip text,
  user_agent text,
  language text,
  languages text,
  timezone text,
  screen text,
  viewport text,
  platform text,
  referrer text,
  url text,
  vendor text,
  device_memory text,
  hw_concurrency text,
  connection text,
  extra jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.signup_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signup_info insert self"
ON public.signup_info FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "signup_info read admin"
ON public.signup_info FOR SELECT TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]));
