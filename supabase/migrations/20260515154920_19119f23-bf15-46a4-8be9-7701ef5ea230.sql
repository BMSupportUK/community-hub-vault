CREATE TABLE public.channel_reads (
  user_id uuid NOT NULL,
  channel_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel_id)
);

CREATE INDEX idx_channel_reads_user ON public.channel_reads(user_id);

ALTER TABLE public.channel_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channel_reads read self"
  ON public.channel_reads FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "channel_reads insert self"
  ON public.channel_reads FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "channel_reads update self"
  ON public.channel_reads FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_channel_reads_updated_at
  BEFORE UPDATE ON public.channel_reads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();