ALTER TABLE public.ticket_video_calls ADD COLUMN IF NOT EXISTS invite_token_hash text;
ALTER TABLE public.ticket_video_calls ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS ticket_video_calls_invite_token_hash_key ON public.ticket_video_calls (invite_token_hash) WHERE invite_token_hash IS NOT NULL;