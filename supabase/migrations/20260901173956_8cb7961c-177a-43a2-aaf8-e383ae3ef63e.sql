ALTER TABLE public.app_transfers
  ADD COLUMN IF NOT EXISTS last_download_status text,
  ADD COLUMN IF NOT EXISTS last_download_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_download_bytes bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_download_total_bytes bigint;