CREATE TABLE public.user_ip_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ip text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_ip_logs_user_id_created_at_idx
  ON public.user_ip_logs (user_id, created_at DESC);

ALTER TABLE public.user_ip_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ip logs read admin"
  ON public.user_ip_logs
  FOR SELECT
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]));

CREATE POLICY "ip logs insert self"
  ON public.user_ip_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
