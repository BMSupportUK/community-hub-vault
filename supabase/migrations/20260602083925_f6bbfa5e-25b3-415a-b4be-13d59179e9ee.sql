-- 1) Add American Football subcategory under USA Sports
INSERT INTO public.sports_subcategories (category_id, name, sort_order, is_default)
SELECT id, 'American Football', 10, false
FROM public.sports_categories
WHERE name = 'USA Sports'
ON CONFLICT DO NOTHING;

-- 2) Review queue for unmatched events
CREATE TABLE public.discord_import_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_text text NOT NULL,
  parsed_event jsonb NOT NULL,
  suggested_category_id uuid REFERENCES public.sports_categories(id) ON DELETE SET NULL,
  suggested_subcategory text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  resolved_at timestamptz,
  resolved_by uuid
);

CREATE INDEX discord_import_queue_status_idx
  ON public.discord_import_queue (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discord_import_queue TO authenticated;
GRANT ALL ON public.discord_import_queue TO service_role;

ALTER TABLE public.discord_import_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff manage discord queue"
  ON public.discord_import_queue
  FOR ALL
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role, 'moderator'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role, 'moderator'::app_role]));
