
-- Helper trigger function (idempotent)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DO $$ BEGIN
  CREATE TYPE public.verification_status AS ENUM ('pending', 'verified', 'flagged');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.verification_checks (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_mx_ok BOOLEAN,
  email_disposable BOOLEAN,
  turnstile_ok BOOLEAN,
  email_code_verified BOOLEAN NOT NULL DEFAULT false,
  email_code_verified_at TIMESTAMPTZ,
  duplicate_ip_count INTEGER NOT NULL DEFAULT 0,
  duplicate_device_count INTEGER NOT NULL DEFAULT 0,
  overall_status public.verification_status NOT NULL DEFAULT 'pending',
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.verification_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own verification" ON public.verification_checks FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));
CREATE POLICY "Users insert own verification" ON public.verification_checks FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins update verification" ON public.verification_checks FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));
CREATE TRIGGER verification_checks_touch BEFORE UPDATE ON public.verification_checks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.email_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_evc_user ON public.email_verification_codes(user_id);
ALTER TABLE public.email_verification_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own codes" ON public.email_verification_codes FOR SELECT
  USING (auth.uid() = user_id);

CREATE TABLE public.email_templates (
  key TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT NOT NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view templates" ON public.email_templates FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));
CREATE POLICY "Admins manage templates" ON public.email_templates FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));
CREATE TRIGGER email_templates_touch BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.email_templates (key, subject, html_body, text_body) VALUES (
  'verification_code',
  'Your {{site_name}} verification code',
  '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:20px;margin:0;"><div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.05);"><h1 style="color:#111;font-size:22px;margin:0 0 12px;">Verify your email</h1><p style="color:#444;font-size:14px;line-height:1.5;margin:0 0 24px;">Enter this code in {{site_name}} to confirm your email address. The code expires in {{expires_in}}.</p><div style="text-align:center;background:#f3f4f6;border-radius:10px;padding:20px;margin:0 0 24px;"><div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#111;font-family:monospace;">{{code}}</div></div><p style="color:#777;font-size:12px;line-height:1.5;margin:0;">If you didn''t request this, you can safely ignore this email.</p></div></body></html>',
  'Your {{site_name}} verification code is: {{code}}

This code expires in {{expires_in}}.

If you did not request this, ignore this email.'
);

ALTER TABLE public.signup_info ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;
CREATE INDEX IF NOT EXISTS idx_signup_info_device_fingerprint ON public.signup_info(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_signup_info_ip ON public.signup_info(ip);
