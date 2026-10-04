ALTER TABLE public.install_blogs
ADD COLUMN video_steps jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.install_blogs.video_steps IS 'Ordered private video steps; each item contains title and guide-videos storage reference.';