DROP POLICY IF EXISTS "Users clear own reset flag" ON public.password_change_required;
REVOKE DELETE ON public.password_change_required FROM authenticated;
GRANT SELECT ON public.password_change_required TO authenticated;
GRANT ALL ON public.password_change_required TO service_role;