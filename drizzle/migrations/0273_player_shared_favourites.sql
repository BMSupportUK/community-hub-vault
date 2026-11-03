CREATE TABLE public.player_favourites (
  owner_key text NOT NULL,
  scope_key text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_key, scope_key),
  CONSTRAINT player_favourites_items_array CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) <= 500)
);
GRANT ALL ON public.player_favourites TO service_role;
ALTER TABLE public.player_favourites ENABLE ROW LEVEL SECURITY;