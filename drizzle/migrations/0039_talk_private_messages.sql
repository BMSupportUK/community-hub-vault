ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS private_to uuid;
CREATE INDEX IF NOT EXISTS chat_messages_private_to_idx ON public.chat_messages (private_to) WHERE private_to IS NOT NULL;

DROP POLICY IF EXISTS "messages read channel" ON public.chat_messages;
CREATE POLICY "messages read channel" ON public.chat_messages FOR SELECT TO authenticated
USING (
  public.can_in_channel(auth.uid(), channel_id, 'view'::text)
  AND (
    private_to IS NULL
    OR private_to = auth.uid()
    OR sender_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'staff'::app_role])
  )
);

DROP POLICY IF EXISTS "messages insert self" ON public.chat_messages;
CREATE POLICY "messages insert self" ON public.chat_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND NOT public.has_role(auth.uid(), 'pending'::app_role)
  AND NOT public.has_role(auth.uid(), 'banned'::app_role)
  AND public.can_in_channel(auth.uid(), channel_id, 'send'::text)
  AND (
    private_to IS NULL
    OR private_to = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'staff'::app_role])
  )
);

DROP POLICY IF EXISTS "messages pin staff" ON public.chat_messages;
CREATE POLICY "messages pin staff" ON public.chat_messages FOR UPDATE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role,'staff'::app_role]))
WITH CHECK (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role,'staff'::app_role])
  AND (private_to IS NULL OR pinned_at IS NULL)
);