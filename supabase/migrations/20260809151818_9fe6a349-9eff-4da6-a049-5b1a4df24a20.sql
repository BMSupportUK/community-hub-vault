CREATE TABLE IF NOT EXISTS public.email_list_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  list_key text NOT NULL CHECK (list_key IN ('competitions','support')),
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at timestamptz,
  UNIQUE (email, list_key)
);

GRANT ALL ON public.email_list_members TO service_role;
GRANT SELECT ON public.email_list_members TO authenticated;

ALTER TABLE public.email_list_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and management can view email lists" ON public.email_list_members;
CREATE POLICY "Admins and management can view email lists"
ON public.email_list_members FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));

CREATE OR REPLACE FUNCTION public.email_is_account_holder(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower(_email)
  )
$$;

REVOKE ALL ON FUNCTION public.email_is_account_holder(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.email_is_account_holder(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_is_account_holder(text) TO service_role;

-- Backfill: competition guest entrants
INSERT INTO public.email_list_members (email, list_key, source)
SELECT DISTINCT lower(email), 'competitions', 'wc_guest_entrants' FROM public.wc_guest_entrants WHERE email IS NOT NULL
ON CONFLICT (email, list_key) DO NOTHING;

INSERT INTO public.email_list_members (email, list_key, source)
SELECT DISTINCT lower(email), 'competitions', 'boro_guest_entrants' FROM public.boro_guest_entrants WHERE email IS NOT NULL
ON CONFLICT (email, list_key) DO NOTHING;

-- Backfill: account holders belong to both lists
INSERT INTO public.email_list_members (email, list_key, source)
SELECT DISTINCT lower(u.email), 'support', 'auth.users' FROM auth.users u WHERE u.email IS NOT NULL
ON CONFLICT (email, list_key) DO NOTHING;

INSERT INTO public.email_list_members (email, list_key, source)
SELECT DISTINCT lower(u.email), 'competitions', 'auth.users' FROM auth.users u WHERE u.email IS NOT NULL
ON CONFLICT (email, list_key) DO NOTHING;