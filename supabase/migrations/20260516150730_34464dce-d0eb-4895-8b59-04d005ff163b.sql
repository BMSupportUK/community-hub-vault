CREATE TABLE public.discount_code_products (
  discount_code_id uuid NOT NULL REFERENCES public.discount_codes(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (discount_code_id, product_id)
);

CREATE INDEX idx_dcp_product ON public.discount_code_products(product_id);

ALTER TABLE public.discount_code_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dcp manage admin"
  ON public.discount_code_products
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]));

CREATE POLICY "dcp read approved"
  ON public.discount_code_products
  FOR SELECT TO authenticated
  USING ((NOT has_role(auth.uid(), 'pending'::app_role)) AND (NOT has_role(auth.uid(), 'banned'::app_role)));