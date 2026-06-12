
ALTER TABLE public.app_demos
  ADD COLUMN category TEXT NOT NULL DEFAULT 'official_server'
    CHECK (category IN ('official_server','official_3rd_party','rebranded'));
