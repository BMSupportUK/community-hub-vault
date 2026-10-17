CREATE TABLE public.captcha_backup_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.captcha_backup_attempts TO service_role;
ALTER TABLE public.captcha_backup_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX captcha_backup_attempts_ip_time ON public.captcha_backup_attempts (ip_hash, created_at DESC);