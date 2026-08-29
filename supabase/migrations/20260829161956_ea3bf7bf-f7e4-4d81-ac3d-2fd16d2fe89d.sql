ALTER TABLE public.shift_slots ADD COLUMN IF NOT EXISTS required_role app_role;

-- Backfill: hourly slots are moderator cover, existing block shifts stay open to staff.
UPDATE public.shift_slots SET required_role = 'moderator' WHERE required_role IS NULL AND slot_type = 'hourly';
UPDATE public.shift_slots SET required_role = 'staff' WHERE required_role IS NULL;

-- Claiming a slot now requires holding the slot's role (admin/management may still manage any slot).
DROP POLICY IF EXISTS "shift_slots claim self" ON public.shift_slots;
CREATE POLICY "shift_slots claim self" ON public.shift_slots
  FOR UPDATE TO authenticated
  USING (
    has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])
    OR (required_role IS NOT NULL AND has_role(auth.uid(), required_role))
  )
  WITH CHECK (
    assigned_to IS NULL
    OR assigned_to = auth.uid()
    OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])
  );