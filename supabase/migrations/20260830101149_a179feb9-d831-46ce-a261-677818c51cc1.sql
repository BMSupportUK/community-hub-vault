DELETE FROM public.blacklist_entries a
USING public.blacklist_entries b
WHERE a.ctid > b.ctid
  AND a.kind = b.kind
  AND lower(btrim(a.value::text)) = lower(btrim(b.value::text));

UPDATE public.blacklist_entries SET value = lower(btrim(value::text));

CREATE UNIQUE INDEX IF NOT EXISTS blacklist_entries_kind_value_uniq
  ON public.blacklist_entries (kind, lower(btrim(value::text)));