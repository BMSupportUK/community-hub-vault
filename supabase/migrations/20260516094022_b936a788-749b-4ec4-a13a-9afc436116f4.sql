
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_recommended boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.product_ratings (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, user_id)
);

ALTER TABLE public.product_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ratings read approved" ON public.product_ratings
  FOR SELECT TO authenticated
  USING (NOT has_role(auth.uid(), 'pending'::app_role) AND NOT has_role(auth.uid(), 'banned'::app_role));

CREATE POLICY "ratings insert self" ON public.product_ratings
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()
    AND NOT has_role(auth.uid(), 'pending'::app_role)
    AND NOT has_role(auth.uid(), 'banned'::app_role));

CREATE POLICY "ratings update self" ON public.product_ratings
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "ratings delete self" ON public.product_ratings
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER product_ratings_set_updated_at
  BEFORE UPDATE ON public.product_ratings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
