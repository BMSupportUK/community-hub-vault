CREATE TABLE public.referral_bonus_acknowledgements (
 customer_id uuid PRIMARY KEY,
 referrer_name text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.referral_bonus_acknowledgements TO authenticated;
GRANT ALL ON public.referral_bonus_acknowledgements TO service_role;
ALTER TABLE public.referral_bonus_acknowledgements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin and management read historical referral bonuses" ON public.referral_bonus_acknowledgements FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]));
COMMENT ON TABLE public.referral_bonus_acknowledgements IS 'Historical referral bonuses already added outside this tracker. Display-only acknowledgements; never extend credential expiry.';