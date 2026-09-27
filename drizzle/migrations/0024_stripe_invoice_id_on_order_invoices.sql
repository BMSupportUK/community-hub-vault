ALTER TABLE public.order_invoices ADD COLUMN stripe_invoice_id text;
ALTER TABLE public.order_invoices ALTER COLUMN square_invoice_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_invoices_stripe_invoice_id ON public.order_invoices (stripe_invoice_id);
COMMENT ON COLUMN public.order_invoices.stripe_invoice_id IS 'Stripe invoice id (in_...) when the order is billed through a Stripe invoice';