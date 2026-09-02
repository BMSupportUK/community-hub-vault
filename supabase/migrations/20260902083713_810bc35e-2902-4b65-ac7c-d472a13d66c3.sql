ALTER TABLE public.ticket_messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;

DROP POLICY IF EXISTS "tmsg update author or admin" ON public.ticket_messages;
CREATE POLICY "tmsg update author or admin"
ON public.ticket_messages
FOR UPDATE
TO authenticated
USING (
  sender_id = auth.uid()
  OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])
)
WITH CHECK (
  sender_id = auth.uid()
  OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])
);