DROP TRIGGER IF EXISTS trg_create_crypto_payout_on_invoice_paid ON public.order_invoices;
DROP FUNCTION IF EXISTS public.create_crypto_payout_on_invoice_paid();