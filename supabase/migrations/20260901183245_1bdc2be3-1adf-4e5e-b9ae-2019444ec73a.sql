ALTER TABLE public.app_transfers
  ADD COLUMN IF NOT EXISTS last_download_user_agent text,
  ADD COLUMN IF NOT EXISTS last_download_device text,
  ADD COLUMN IF NOT EXISTS last_download_ip text;