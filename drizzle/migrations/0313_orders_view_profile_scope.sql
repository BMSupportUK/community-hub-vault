CREATE OR REPLACE VIEW public.orders AS
SELECT id, user_id, (status)::text AS status, total_cents, discount_cents, discount_code, shipping_name, customer_type, existing_username, notes,
  CASE WHEN ((user_id = auth.uid()) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])) THEN private.app_decrypt(shipping_address_enc) ELSE NULL::text END AS shipping_address,
  CASE WHEN ((user_id = auth.uid()) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])) THEN private.app_decrypt(email_enc) ELSE NULL::text END AS email,
  paid_at, paid_by, completed_at, completed_by, created_at, updated_at, wants_adult_content, order_ref, manual_pay_method,
  credential_id
FROM private.orders
WHERE auth.uid() IS NULL OR user_id IS DISTINCT FROM auth.uid() OR credential_id IS NULL OR credential_id = public.active_profile_credential();