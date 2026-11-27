REVOKE ALL ON public.sensitive_gate_sessions FROM anon,authenticated;
REVOKE ALL ON public.internal_push_auth FROM anon,authenticated;
GRANT ALL ON public.sensitive_gate_sessions TO service_role;
GRANT ALL ON public.internal_push_auth TO service_role;