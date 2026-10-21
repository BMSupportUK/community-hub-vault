-- Customers can read their own first subscription date for their member home card.
CREATE POLICY "customer_history_own_read"
 ON public.customer_subscription_history
 FOR SELECT
 TO authenticated
 USING (customer_id = auth.uid());