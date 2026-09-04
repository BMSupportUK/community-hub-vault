ALTER TABLE public.app_builds ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'bm_store';
ALTER TABLE public.app_builds DROP CONSTRAINT IF EXISTS app_builds_category_check;
ALTER TABLE public.app_builds ADD CONSTRAINT app_builds_category_check CHECK (category IN ('official_server','official_3rd_party','rebranded','bm_store'));