CREATE TABLE public.staff_quick_replies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  body text NOT NULL,
  shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_quick_replies TO authenticated;
GRANT ALL ON public.staff_quick_replies TO service_role;

ALTER TABLE public.staff_quick_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own and shared quick replies"
ON public.staff_quick_replies FOR SELECT TO authenticated
USING (
  public.has_any_role(auth.uid(), array['admin','management','moderator','staff']::app_role[])
  AND (user_id = auth.uid() OR shared)
);

CREATE POLICY "Staff can create own quick replies"
ON public.staff_quick_replies FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.has_any_role(auth.uid(), array['admin','management','moderator','staff']::app_role[])
);

CREATE POLICY "Staff can update own quick replies"
ON public.staff_quick_replies FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Staff can delete own quick replies"
ON public.staff_quick_replies FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER staff_quick_replies_updated_at
BEFORE UPDATE ON public.staff_quick_replies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();