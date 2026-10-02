DO $$ DECLARE c text; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.affiliate_banners'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%size%' LOOP
    EXECUTE format('ALTER TABLE public.affiliate_banners DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.affiliate_banners ADD CONSTRAINT affiliate_banners_size_check CHECK (size IN ('leaderboard','skyscraper','square'));