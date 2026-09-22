ALTER TABLE public.discord_import_queue ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'paste';
ALTER TABLE public.discord_import_queue ADD COLUMN IF NOT EXISTS source_ref text;
ALTER TABLE public.discord_import_queue ADD COLUMN IF NOT EXISTS forwarded_from text;

CREATE UNIQUE INDEX IF NOT EXISTS discord_import_queue_source_ref_unique
  ON public.discord_import_queue (source_ref)
  WHERE source_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.telegram_sports_sources (
  telegram_user_id bigint PRIMARY KEY,
  telegram_username text,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_sports_sources TO authenticated;
GRANT ALL ON public.telegram_sports_sources TO service_role;

ALTER TABLE public.telegram_sports_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read telegram sports sources"
  ON public.telegram_sports_sources FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'moderator')
  );

CREATE POLICY "Staff can manage telegram sports sources"
  ON public.telegram_sports_sources FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'moderator')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'moderator')
  );