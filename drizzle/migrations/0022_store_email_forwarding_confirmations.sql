CREATE TABLE public.email_forwarding_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sender TEXT NOT NULL,
  subject TEXT NOT NULL,
  confirmation_code TEXT,
  confirmation_url TEXT,
  excerpt TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.email_forwarding_confirmations TO authenticated;
GRANT ALL ON public.email_forwarding_confirmations TO service_role;
ALTER TABLE public.email_forwarding_confirmations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view email forwarding confirmations"
ON public.email_forwarding_confirmations
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX email_forwarding_confirmations_received_at_idx
ON public.email_forwarding_confirmations (received_at DESC);