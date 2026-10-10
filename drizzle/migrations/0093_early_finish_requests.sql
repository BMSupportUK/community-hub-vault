ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS early_finish_at timestamptz, ADD COLUMN IF NOT EXISTS early_finish_approved_by uuid, ADD COLUMN IF NOT EXISTS early_finish_reason text;

CREATE TABLE public.early_finish_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','cancelled')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX early_finish_one_pending ON public.early_finish_requests(shift_id) WHERE status = 'pending';
GRANT SELECT, INSERT ON public.early_finish_requests TO authenticated;
GRANT ALL ON public.early_finish_requests TO service_role;
ALTER TABLE public.early_finish_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or managers read" ON public.early_finish_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));
CREATE POLICY "staff request own open shift" ON public.early_finish_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending' AND EXISTS (
    SELECT 1 FROM public.shifts s WHERE s.id = shift_id AND s.user_id = auth.uid() AND s.clock_out IS NULL));

CREATE OR REPLACE FUNCTION public.decide_early_finish(_id uuid, _approve boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.early_finish_requests;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management')) THEN
    RAISE EXCEPTION 'Only admin or management can decide early finishes';
  END IF;
  SELECT * INTO r FROM public.early_finish_requests WHERE id = _id FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'pending' THEN RAISE EXCEPTION 'Request already handled'; END IF;
  UPDATE public.early_finish_requests SET status = CASE WHEN _approve THEN 'approved' ELSE 'declined' END,
    decided_by = auth.uid(), decided_at = now() WHERE id = _id;
  IF _approve THEN
    UPDATE public.breaks SET ended_at = now() WHERE shift_id = r.shift_id AND ended_at IS NULL;
    UPDATE public.shifts SET clock_out = now(), early_finish_at = now(),
      early_finish_approved_by = auth.uid(), early_finish_reason = r.reason
      WHERE id = r.shift_id AND clock_out IS NULL;
    RETURN 'approved';
  END IF;
  RETURN 'declined';
END $$;
REVOKE ALL ON FUNCTION public.decide_early_finish(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_early_finish(uuid, boolean) TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.early_finish_requests;