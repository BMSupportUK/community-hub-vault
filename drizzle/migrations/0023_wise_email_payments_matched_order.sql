ALTER TABLE public.wise_email_payments
  ADD COLUMN IF NOT EXISTS matched_order_id uuid REFERENCES private.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS wise_email_payments_matched_order_idx
  ON public.wise_email_payments (matched_order_id)
  WHERE matched_order_id IS NOT NULL;