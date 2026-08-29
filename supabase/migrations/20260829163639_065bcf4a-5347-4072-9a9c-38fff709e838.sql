-- Tag any untagged block shifts as staff
UPDATE public.shift_slots SET required_role = 'staff'
WHERE slot_type = 'shift' AND required_role IS NULL;

-- Backfill role-specific slots for today onwards, based on each day's existing shift times
WITH day_times AS (
  SELECT DISTINCT shift_date, start_time, end_time
  FROM public.shift_slots
  WHERE slot_type = 'shift' AND shift_date >= CURRENT_DATE
),
quota(role, n) AS (
  VALUES ('admin'::public.app_role, 2), ('management'::public.app_role, 1), ('staff'::public.app_role, 3)
),
wanted AS (
  SELECT dt.shift_date, dt.start_time, dt.end_time, q.role, gs.i
  FROM day_times dt
  CROSS JOIN quota q
  CROSS JOIN LATERAL generate_series(1, q.n) AS gs(i)
),
have AS (
  SELECT shift_date, start_time, end_time, required_role, row_number() OVER (
      PARTITION BY shift_date, start_time, end_time, required_role ORDER BY created_at
    ) AS i
  FROM public.shift_slots
  WHERE slot_type = 'shift' AND shift_date >= CURRENT_DATE
)
INSERT INTO public.shift_slots (shift_date, start_time, end_time, slot_type, required_role, notes)
SELECT w.shift_date, w.start_time, w.end_time, 'shift', w.role,
       CASE w.role::text WHEN 'admin' THEN 'Owner cover' WHEN 'management' THEN 'Management cover' ELSE 'Staff cover' END
FROM wanted w
LEFT JOIN have h
  ON h.shift_date = w.shift_date AND h.start_time = w.start_time
 AND h.end_time = w.end_time AND h.required_role = w.role AND h.i = w.i
WHERE h.shift_date IS NULL;