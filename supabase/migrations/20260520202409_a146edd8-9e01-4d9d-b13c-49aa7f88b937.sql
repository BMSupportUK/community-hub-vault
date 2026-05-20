ALTER TABLE public.order_payments
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'square',
  ADD COLUMN IF NOT EXISTS provider_payment_id text;

UPDATE public.order_payments
  SET provider_payment_id = square_payment_id
  WHERE provider_payment_id IS NULL;

ALTER TABLE public.order_payments
  ALTER COLUMN square_payment_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_payments_provider_payment_id
  ON public.order_payments (provider, provider_payment_id);