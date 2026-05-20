-- 1) Dedupe existing shift_slots on (date, start, end, slot_type)
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY shift_date, start_time, end_time, slot_type
           ORDER BY (assigned_to IS NOT NULL) DESC, created_at ASC
         ) AS rn
  FROM public.shift_slots
)
DELETE FROM public.shift_slots s
USING ranked r
WHERE s.id = r.id AND r.rn > 1;

-- 2) Prevent duplicate slot rows for the same date/time/type
CREATE UNIQUE INDEX IF NOT EXISTS shift_slots_unique_slot
  ON public.shift_slots (shift_date, start_time, end_time, slot_type);

-- 3) Prevent the same user being assigned twice for the same date/time window
CREATE UNIQUE INDEX IF NOT EXISTS shift_slots_unique_user_assignment
  ON public.shift_slots (shift_date, start_time, end_time, assigned_to)
  WHERE assigned_to IS NOT NULL;