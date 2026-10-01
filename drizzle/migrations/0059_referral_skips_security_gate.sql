CREATE OR REPLACE FUNCTION public.redeem_invite(p_code text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_invite RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_invite FROM public.invites WHERE upper(code) = upper(btrim(p_code)) LIMIT 1;
  IF v_invite IS NULL THEN RAISE EXCEPTION 'Invalid invite code'; END IF;
  IF v_invite.used_by IS NOT NULL THEN RAISE EXCEPTION 'This invite has already been used'; END IF;
  IF v_invite.created_by = v_uid THEN RAISE EXCEPTION 'You cannot redeem your own invite'; END IF;

  UPDATE public.invites SET used_by = v_uid, used_at = now() WHERE id = v_invite.id;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role IN ('banned','rejected')) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'nonsubscriber')
    ON CONFLICT (user_id, role) DO NOTHING;
    -- Referral sign-ups skip the security gate entirely.
    DELETE FROM public.user_roles WHERE user_id = v_uid AND role = 'pending';
    UPDATE public.gate_applications SET status = 'approved'
     WHERE user_id = v_uid AND status = 'pending';
  END IF;

  RETURN jsonb_build_object('ok', true, 'pending_approval', false, 'granted_role', 'nonsubscriber');
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_invite_access()
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.invites WHERE used_by = v_uid) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role IN ('banned','rejected')) THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'nonsubscriber')
  ON CONFLICT (user_id, role) DO NOTHING;
  DELETE FROM public.user_roles WHERE user_id = v_uid AND role = 'pending';
  UPDATE public.gate_applications SET status = 'approved' WHERE user_id = v_uid AND status = 'pending';
  RETURN true;
END;
$function$;

-- Clean up existing referral accounts still stuck waiting.
DELETE FROM public.user_roles r USING public.invites i
 WHERE r.user_id = i.used_by AND r.role = 'pending'
   AND EXISTS (SELECT 1 FROM public.user_roles o WHERE o.user_id = r.user_id AND o.role <> 'pending');
UPDATE public.gate_applications g SET status = 'approved'
  FROM public.invites i WHERE g.user_id = i.used_by AND g.status = 'pending'
   AND NOT EXISTS (SELECT 1 FROM public.user_roles o WHERE o.user_id = g.user_id AND o.role IN ('banned','rejected'));