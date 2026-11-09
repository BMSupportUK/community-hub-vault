ALTER TABLE public.player_login_approvals ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.player_login_approvals ADD COLUMN offsite_customer_id uuid REFERENCES public.player_offsite_customers(id) ON DELETE CASCADE;
ALTER TABLE public.player_login_approvals ADD COLUMN token_hash text;
ALTER TABLE public.player_login_approvals ADD COLUMN decided_by text;
CREATE UNIQUE INDEX player_login_approvals_token_idx ON public.player_login_approvals(token_hash) WHERE token_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.staff_player_login_requests()
RETURNS TABLE(id uuid, device_id uuid, platform text, device_name text, customer_name text, account_number integer, has_email boolean, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.device_id, d.platform, d.name, o.customer_name, o.number, coalesce(o.email,'') <> '', a.created_at
    FROM public.player_login_approvals a
    JOIN public.player_devices d ON d.id = a.device_id
    JOIN public.player_offsite_customers o ON o.id = a.offsite_customer_id
   WHERE a.status = 'pending' AND a.created_at > now() - interval '30 minutes'
     AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'))
   ORDER BY a.created_at DESC
$$;
REVOKE ALL ON FUNCTION public.staff_player_login_requests() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.staff_player_login_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_decide_player_login(p_id uuid, p_approve boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management')) THEN RAISE EXCEPTION 'Not allowed.'; END IF;
  SELECT * INTO a FROM public.player_login_approvals WHERE id = p_id AND status = 'pending' AND offsite_customer_id IS NOT NULL FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'This request has expired.'; END IF;
  IF p_approve THEN
    UPDATE public.player_devices SET remote_unlock_at = now(), unlock_failures = 0, unlock_locked_until = NULL WHERE id = a.device_id;
  END IF;
  UPDATE public.player_login_approvals SET status = CASE WHEN p_approve THEN 'approved' ELSE 'denied' END, decided_at = now(), decided_by = 'staff:' || auth.uid()::text
   WHERE device_id = a.device_id AND status = 'pending';
  RETURN CASE WHEN p_approve THEN 'approved' ELSE 'denied' END;
END $$;
REVOKE ALL ON FUNCTION public.staff_decide_player_login(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.staff_decide_player_login(uuid, boolean) TO authenticated;