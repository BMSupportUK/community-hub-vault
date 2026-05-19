
CREATE POLICY "Order owners view own invoices"
ON public.order_invoices FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_invoices.order_id AND o.user_id = auth.uid()
  )
);

CREATE POLICY "Order owners insert own invoices"
ON public.order_invoices FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_invoices.order_id AND o.user_id = auth.uid()
  )
);

CREATE POLICY "Order owners update own invoices"
ON public.order_invoices FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_invoices.order_id AND o.user_id = auth.uid()
  )
);
