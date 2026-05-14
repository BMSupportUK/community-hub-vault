CREATE TYPE public.review_status AS ENUM ('pending','approved','rejected');

CREATE TABLE public.customer_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text NOT NULL,
  body text NOT NULL,
  status public.review_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews read approved or own"
ON public.customer_reviews FOR SELECT TO authenticated
USING (status = 'approved' OR user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE POLICY "reviews insert self"
ON public.customer_reviews FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND status = 'pending');

CREATE POLICY "reviews update own pending or admin"
ON public.customer_reviews FOR UPDATE TO authenticated
USING ((user_id = auth.uid() AND status = 'pending') OR public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]))
WITH CHECK ((user_id = auth.uid() AND status = 'pending') OR public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE POLICY "reviews delete own or admin"
ON public.customer_reviews FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE TRIGGER customer_reviews_set_updated_at
BEFORE UPDATE ON public.customer_reviews
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX customer_reviews_status_created_idx ON public.customer_reviews (status, created_at DESC);