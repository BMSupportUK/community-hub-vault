CREATE TABLE public.wise_email_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'GBP',
  sender_name text,
  reference text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  excerpt text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.wise_email_payments TO service_role;
ALTER TABLE public.wise_email_payments ENABLE ROW LEVEL SECURITY;