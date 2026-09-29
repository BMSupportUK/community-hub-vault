CREATE TABLE public.remote_signout_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  target_id uuid NOT NULL,
  sessions_revoked int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.remote_signout_log TO authenticated;
GRANT ALL ON public.remote_signout_log TO service_role;
ALTER TABLE public.remote_signout_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and management read remote signout log" ON public.remote_signout_log
FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));

CREATE OR REPLACE FUNCTION public.admin_user_session_info(_target uuid)
RETURNS TABLE(session_count int, last_sign_in timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT (SELECT count(*)::int FROM auth.sessions s WHERE s.user_id = _target),
         (SELECT u.last_sign_in_at FROM auth.users u WHERE u.id = _target)
$$;
REVOKE ALL ON FUNCTION public.admin_user_session_info(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_session_info(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_revoke_user_sessions(_target uuid, _keep_session uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE n int;
BEGIN
  DELETE FROM auth.sessions WHERE user_id = _target AND (_keep_session IS NULL OR id <> _keep_session);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.admin_revoke_user_sessions(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_user_sessions(uuid, uuid) TO service_role;