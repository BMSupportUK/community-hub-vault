UPDATE public.about_us_content
SET heading = 'About BM Support',
    body = 'BM Support is a Middlesbrough-based team serving customers across the UK and overseas. We help individuals and small businesses get reliable, secure access to the online services and tools they depend on every day.'
WHERE section_key = 'intro';

DELETE FROM public.about_us_content WHERE section_key = 'what_we_sell';