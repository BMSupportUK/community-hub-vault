CREATE OR REPLACE FUNCTION public.replace_discord_import_queue_item_with_split(
  p_original_id uuid,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_created integer;
BEGIN
  SELECT status INTO v_status
  FROM public.discord_import_queue
  WHERE id = p_original_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue item not found';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Queue item is no longer pending';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) < 2 THEN
    RAISE EXCEPTION 'A split must contain at least two replacement items';
  END IF;

  INSERT INTO public.discord_import_queue
    (raw_text, parsed_event, status, source, source_ref, forwarded_from, created_by)
  SELECT
    row_data->>'raw_text',
    row_data->'parsed_event',
    COALESCE(row_data->>'status', 'pending'),
    COALESCE(row_data->>'source', 'paste'),
    row_data->>'source_ref',
    row_data->>'forwarded_from',
    (row_data->>'created_by')::uuid
  FROM jsonb_array_elements(p_rows) AS row_data;

  GET DIAGNOSTICS v_created = ROW_COUNT;
  IF v_created <> jsonb_array_length(p_rows) THEN
    RAISE EXCEPTION 'Not every split item was created';
  END IF;

  UPDATE public.discord_import_queue
  SET status = 'discarded', resolved_at = now()
  WHERE id = p_original_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original queue item could not be replaced';
  END IF;

  RETURN v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_discord_import_queue_item_with_split(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_discord_import_queue_item_with_split(uuid, jsonb) TO service_role;