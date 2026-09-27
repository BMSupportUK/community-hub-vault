ALTER TABLE public.wise_email_payments ADD COLUMN IF NOT EXISTS auto_matched boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.wise_email_payments.auto_matched IS 'True when the payment was tied to its order and marked as received automatically (reference + amount matched exactly one awaiting order).';
GRANT SELECT ON public.wise_email_payments TO authenticated;
GRANT ALL ON public.wise_email_payments TO service_role;