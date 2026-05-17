
CREATE TABLE IF NOT EXISTS public.admin_unlock_lockouts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  failed_count int NOT NULL DEFAULT 0,
  last_failed_at timestamptz,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_unlock_lockouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own lockout"
  ON public.admin_unlock_lockouts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No direct INSERT/UPDATE/DELETE policies; only the SECURITY DEFINER functions below can mutate.

CREATE OR REPLACE FUNCTION public.record_admin_unlock_failure()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_window interval := interval '15 minutes';
  v_max_fails int := 5;
  v_lock_dur interval := interval '15 minutes';
  v_row public.admin_unlock_lockouts;
  v_new_count int;
  v_locked timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_any_role(v_uid, ARRAY['admin','management']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_row FROM public.admin_unlock_lockouts WHERE user_id = v_uid;

  IF v_row.user_id IS NULL THEN
    v_new_count := 1;
    INSERT INTO public.admin_unlock_lockouts (user_id, failed_count, last_failed_at, updated_at)
    VALUES (v_uid, 1, now(), now());
  ELSE
    -- Reset counter if outside window
    IF v_row.last_failed_at IS NULL OR v_row.last_failed_at < now() - v_window THEN
      v_new_count := 1;
    ELSE
      v_new_count := v_row.failed_count + 1;
    END IF;

    IF v_new_count >= v_max_fails THEN
      v_locked := now() + v_lock_dur;
    ELSE
      v_locked := v_row.locked_until;
    END IF;

    UPDATE public.admin_unlock_lockouts
      SET failed_count = v_new_count,
          last_failed_at = now(),
          locked_until = v_locked,
          updated_at = now()
      WHERE user_id = v_uid;
  END IF;

  RETURN jsonb_build_object(
    'failed_count', v_new_count,
    'max_fails', v_max_fails,
    'locked_until', (SELECT locked_until FROM public.admin_unlock_lockouts WHERE user_id = v_uid)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_admin_unlock_failures()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.admin_unlock_lockouts WHERE user_id = v_uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_admin_unlock_lockout()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.admin_unlock_lockouts;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_row FROM public.admin_unlock_lockouts WHERE user_id = v_uid;
  IF v_row.user_id IS NULL THEN
    RETURN jsonb_build_object('failed_count', 0, 'max_fails', 5, 'locked_until', null);
  END IF;
  RETURN jsonb_build_object(
    'failed_count', v_row.failed_count,
    'max_fails', 5,
    'locked_until', v_row.locked_until
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_admin_unlock_failure() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.clear_admin_unlock_failures() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.check_admin_unlock_lockout() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_admin_unlock_failure() TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_admin_unlock_failures() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_admin_unlock_lockout() TO authenticated;
