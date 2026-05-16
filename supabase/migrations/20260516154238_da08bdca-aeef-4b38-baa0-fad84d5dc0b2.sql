CREATE POLICY "order_items delete own pending"
ON public.order_items
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM private.orders o
    WHERE o.id = order_items.order_id
      AND o.user_id = auth.uid()
      AND o.status = 'pending'
      AND o.paid_at IS NULL
      AND o.completed_at IS NULL
  )
);