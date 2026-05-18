REVOKE ALL ON FUNCTION public.mark_order_paid(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_order_paid(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_order_paid(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';