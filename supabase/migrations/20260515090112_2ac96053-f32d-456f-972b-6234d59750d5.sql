
ALTER TABLE public.invites
  ADD COLUMN IF NOT EXISTS referral_bonus_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS referral_bonus_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS referral_bonus_paid_by uuid;

DROP POLICY IF EXISTS "invites update admin" ON public.invites;
CREATE POLICY "invites update admin"
ON public.invites
FOR UPDATE
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]));
