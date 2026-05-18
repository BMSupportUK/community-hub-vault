COMMENT ON VIEW public.orders IS 'Shop orders API view; status exposed as text so legacy paid updates can be normalized by tg_orders_iud. Refreshed 2026-05-18.';
NOTIFY pgrst, 'reload schema';