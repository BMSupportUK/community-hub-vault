-- Invites table
CREATE TABLE public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  used_by uuid,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invites_created_by ON public.invites(created_by);
CREATE INDEX idx_invites_code ON public.invites(code);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invites insert approved"
ON public.invites FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND NOT public.has_role(auth.uid(), 'pending'::app_role)
  AND NOT public.has_role(auth.uid(), 'banned'::app_role)
);

CREATE POLICY "invites read own or admin"
ON public.invites FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role])
);

CREATE POLICY "invites delete own unused or admin"
ON public.invites FOR DELETE
TO authenticated
USING (
  (created_by = auth.uid() AND used_by IS NULL)
  OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role])
);

-- Redeem function: bypasses gate, grants member role
CREATE OR REPLACE FUNCTION public.redeem_invite(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invite RECORD;
  v_clean text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_clean := upper(btrim(coalesce(p_code, '')));
  IF length(v_clean) = 0 THEN RAISE EXCEPTION 'Please enter an invite code'; END IF;

  SELECT id, created_by, used_by INTO v_invite
  FROM public.invites
  WHERE code = v_clean
  LIMIT 1;

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  IF v_invite.used_by IS NOT NULL THEN
    RAISE EXCEPTION 'This invite has already been used';
  END IF;

  IF v_invite.created_by = v_uid THEN
    RAISE EXCEPTION 'You cannot redeem your own invite';
  END IF;

  UPDATE public.invites
  SET used_by = v_uid, used_at = now()
  WHERE id = v_invite.id;

  DELETE FROM public.user_roles
  WHERE user_id = v_uid AND role IN ('pending'::app_role, 'banned'::app_role);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'member'::app_role)
  ON CONFLICT DO NOTHING;

  UPDATE public.gate_applications
  SET status = 'approved', reviewed_at = now(), reviewed_by = v_invite.created_by
  WHERE user_id = v_uid AND status = 'pending';

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Leaderboard function (aggregates per inviter, visible to approved users)
CREATE OR REPLACE FUNCTION public.get_invite_leaderboard()
RETURNS TABLE(
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  used_count bigint,
  total_count bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS user_id,
    p.display_name,
    p.username,
    p.avatar_url,
    COUNT(*) FILTER (WHERE i.used_by IS NOT NULL)::bigint AS used_count,
    COUNT(*)::bigint AS total_count
  FROM public.invites i
  JOIN public.profiles p ON p.id = i.created_by
  WHERE NOT public.has_role(auth.uid(), 'pending'::app_role)
    AND NOT public.has_role(auth.uid(), 'banned'::app_role)
  GROUP BY p.id, p.display_name, p.username, p.avatar_url
  ORDER BY used_count DESC, total_count DESC
  LIMIT 100;
$$;