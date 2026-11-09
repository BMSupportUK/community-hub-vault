CREATE TABLE public.player_login_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.player_devices(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  credential_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX player_login_approvals_owner_idx ON public.player_login_approvals(owner_id, status, created_at DESC);
CREATE INDEX player_login_approvals_device_idx ON public.player_login_approvals(device_id, created_at DESC);
GRANT ALL ON public.player_login_approvals TO service_role;
ALTER TABLE public.player_login_approvals ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.my_player_login_requests()
RETURNS TABLE(id uuid, device_id uuid, platform text, device_name text, current_login text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.device_id, d.platform, d.name, d.iptv_username, a.created_at
    FROM public.player_login_approvals a JOIN public.player_devices d ON d.id = a.device_id
   WHERE a.owner_id = auth.uid() AND a.status = 'pending' AND a.created_at > now() - interval '5 minutes'
   ORDER BY a.created_at DESC
$$;
REVOKE ALL ON FUNCTION public.my_player_login_requests() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_player_login_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_player_login(p_id uuid, p_approve boolean, p_credential uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public AS $$
DECLARE a record; d record; num integer; sw text;
BEGIN
  SELECT * INTO a FROM public.player_login_approvals WHERE id = p_id AND owner_id = auth.uid() AND status = 'pending' FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'This request has expired.'; END IF;
  IF NOT p_approve THEN
    UPDATE public.player_login_approvals SET status='denied', decided_at=now() WHERE id=p_id;
    RETURN 'denied';
  END IF;
  SELECT id, credential_id INTO d FROM public.player_devices WHERE id = a.device_id AND user_id = auth.uid();
  IF d.id IS NULL THEN RAISE EXCEPTION 'This box is no longer linked to you.'; END IF;
  IF p_credential IS NOT NULL AND p_credential IS DISTINCT FROM d.credential_id THEN
    SELECT player_number INTO num FROM private.app_credentials WHERE id = p_credential AND owner_id = auth.uid();
    IF num IS NULL THEN RAISE EXCEPTION 'That profile was not found.'; END IF;
    sw := public.device_switch_profile_by_number(d.id, num::text);
    IF sw IS NULL THEN RAISE EXCEPTION 'That profile has no saved login.'; END IF;
  END IF;
  UPDATE public.player_devices SET remote_unlock_at = now(), unlock_failures = 0, unlock_locked_until = NULL WHERE id = d.id;
  UPDATE public.player_login_approvals SET status='approved', decided_at=now(), credential_id=p_credential WHERE id=p_id;
  UPDATE public.player_login_approvals SET status='denied', decided_at=now() WHERE device_id=d.id AND status='pending';
  RETURN 'approved';
END $$;
REVOKE ALL ON FUNCTION public.decide_player_login(uuid, boolean, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.decide_player_login(uuid, boolean, uuid) TO authenticated;