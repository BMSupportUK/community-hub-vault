CREATE TABLE public.order_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL UNIQUE REFERENCES private.orders(id) ON DELETE CASCADE,
  square_payment_id TEXT NOT NULL,
  status TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  card_brand TEXT,
  last_4 TEXT,
  receipt_url TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/management manage payments"
ON public.order_payments
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));

CREATE POLICY "Order owner can view own payment"
ON public.order_payments
FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM private.orders o WHERE o.id = order_id AND o.user_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.set_order_payments_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_order_payments_updated_at
BEFORE UPDATE ON public.order_payments
FOR EACH ROW EXECUTE FUNCTION public.set_order_payments_updated_at();