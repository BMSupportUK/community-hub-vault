ALTER TABLE public.chat_messages
  ADD COLUMN pinned_at timestamptz,
  ADD COLUMN pinned_by uuid;

CREATE INDEX idx_chat_messages_pinned ON public.chat_messages(channel_id, pinned_at) WHERE pinned_at IS NOT NULL;

CREATE POLICY "messages pin staff" ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin','management','moderator','staff']::app_role[]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','management','moderator','staff']::app_role[]));