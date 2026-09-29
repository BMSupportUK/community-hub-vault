-- lovable-cron-fallback-reviewed: shift start/end reminders are time-based; 5-minute check with 10-minute lookahead guarantees each alert lands 5-10 min early
CREATE OR REPLACE FUNCTION public.queue_shift_phone_alerts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tz text := coalesce((SELECT value->>'tz' FROM app_settings WHERE key='timezone'), 'Europe/London');
  c integer;
BEGIN
  WITH w AS (
    SELECT s.id, s.assigned_to,
      (s.shift_date + s.start_time) AT TIME ZONE tz AS starts_at,
      CASE WHEN s.end_time <= s.start_time
        THEN (s.shift_date + 1 + s.end_time) AT TIME ZONE tz
        ELSE (s.shift_date + s.end_time) AT TIME ZONE tz END AS ends_at,
      to_char(s.start_time,'HH24:MI') AS st, to_char(s.end_time,'HH24:MI') AS et
    FROM shift_slots s
    WHERE s.assigned_to IS NOT NULL AND s.slot_type='shift'
      AND s.shift_date BETWEEN current_date - 1 AND current_date + 1
  )
  INSERT INTO user_notifications (user_id, kind, title, body, link_path, source_type, source_id)
  SELECT assigned_to, 'shift_start', 'Your shift starts soon',
         'Your shift starts at ' || st || '. Open BM Support to clock in.', '/home', 'shift_slot', id
  FROM w WHERE starts_at BETWEEN now() AND now() + interval '10 minutes'
    AND NOT EXISTS (SELECT 1 FROM user_notifications u WHERE u.source_id=w.id AND u.kind='shift_start')
  UNION ALL
  SELECT assigned_to, 'shift_end', 'Your shift ends soon',
         'Your shift ends at ' || et || '. Open BM Support to clock out.', '/home', 'shift_slot', id
  FROM w WHERE ends_at BETWEEN now() AND now() + interval '10 minutes'
    AND NOT EXISTS (SELECT 1 FROM user_notifications u WHERE u.source_id=w.id AND u.kind='shift_end');
  GET DIAGNOSTICS c = ROW_COUNT;
  RETURN c;
END $$;
REVOKE EXECUTE ON FUNCTION public.queue_shift_phone_alerts() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('shift-phone-alerts') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='shift-phone-alerts');
SELECT cron.schedule('shift-phone-alerts', '*/5 * * * *', $$ SELECT public.queue_shift_phone_alerts(); $$);