REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.staff_records FROM anon, authenticated;
REVOKE SELECT ON public.staff_records FROM anon;
GRANT SELECT ON public.staff_records TO authenticated;
GRANT ALL ON public.staff_records TO service_role;