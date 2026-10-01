CREATE OR REPLACE FUNCTION public.replace_discord_import_queue_item_with_split(p_original_id uuid, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_created_at timestamptz;
  v_created integer;
BEGIN
  SELECT status, created_at INTO v_status, v_created_at
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

  -- Parts keep the original post's arrival time (plus 1ms per part) so
  -- merges stay oldest-first and parts stay in their original order.
  INSERT INTO public.discord_import_queue
    (raw_text, parsed_event, status, source, source_ref, forwarded_from, created_by, created_at)
  SELECT
    e.row_data->>'raw_text',
    e.row_data->'parsed_event',
    COALESCE(e.row_data->>'status', 'pending'),
    COALESCE(e.row_data->>'source', 'paste'),
    e.row_data->>'source_ref',
    e.row_data->>'forwarded_from',
    (e.row_data->>'created_by')::uuid,
    COALESCE(v_created_at, now()) + ((e.ord - 1) * interval '1 millisecond')
  FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS e(row_data, ord);

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
$function$;