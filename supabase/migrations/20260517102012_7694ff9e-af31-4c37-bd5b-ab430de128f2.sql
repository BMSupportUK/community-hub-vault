
CREATE TABLE IF NOT EXISTS public.admin_backup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  batch_id uuid NOT NULL,
  UNIQUE (user_id, code_hash)
);

CREATE INDEX IF NOT EXISTS idx_admin_backup_codes_user ON public.admin_backup_codes(user_id, used_at);

ALTER TABLE public.admin_backup_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view their own backup codes"
  ON public.admin_backup_codes FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[])
  );

CREATE POLICY "Admins insert their own backup codes"
  ON public.admin_backup_codes FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[])
  );

CREATE POLICY "Admins update their own backup codes"
  ON public.admin_backup_codes FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[])
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[])
  );

CREATE POLICY "Admins delete their own backup codes"
  ON public.admin_backup_codes FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[])
  );
