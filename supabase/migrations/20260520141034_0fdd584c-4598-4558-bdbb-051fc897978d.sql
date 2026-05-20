-- Restrict shop product & discount management to admin role only
DROP POLICY IF EXISTS "products manage admin" ON public.products;
CREATE POLICY "products manage admin" ON public.products
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "products read active or staff" ON public.products;
CREATE POLICY "products read active or staff" ON public.products
  FOR SELECT TO authenticated
  USING (is_active = true OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "product_categories manage admin" ON public.product_categories;
CREATE POLICY "product_categories manage admin" ON public.product_categories
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "discount manage admin" ON public.discount_codes;
CREATE POLICY "discount manage admin" ON public.discount_codes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "discount read own or global" ON public.discount_codes;
CREATE POLICY "discount read own or global" ON public.discount_codes
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND (user_id IS NULL OR user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  );

DROP POLICY IF EXISTS "dcp manage admin" ON public.discount_code_products;
CREATE POLICY "dcp manage admin" ON public.discount_code_products
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));