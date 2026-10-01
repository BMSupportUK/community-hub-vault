INSERT INTO public.order_payments (order_id, provider, status, amount_cents, currency)
SELECT o.id, 'bank_transfer', 'paid', o.total_cents, 'GBP'
FROM public.orders o
WHERE o.id = '358be78f-b252-4f03-bc32-35c236148450'
  AND o.paid_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.order_payments p WHERE p.order_id = o.id);