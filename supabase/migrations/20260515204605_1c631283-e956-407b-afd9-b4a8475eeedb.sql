CREATE OR REPLACE FUNCTION public.cleanup_old_chat_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  WITH del AS (
    DELETE FROM public.chat_messages cm
    USING public.chat_channels c
    WHERE cm.channel_id = c.id
      AND cm.created_at < now() - interval '24 hours'
      AND cm.pinned_at IS NULL
      AND c.slug NOT IN ('welcome', 'rules')
    RETURNING cm.id
  )
  SELECT count(*) INTO v_deleted FROM del;
  RETURN v_deleted;
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;