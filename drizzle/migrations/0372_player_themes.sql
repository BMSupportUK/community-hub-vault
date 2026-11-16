CREATE TABLE public.player_themes (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{1,40}$'),
  name text NOT NULL,
  grp text NOT NULL DEFAULT 'Other',
  image_path text NOT NULL,
  sort int NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_themes TO authenticated;
GRANT ALL ON public.player_themes TO service_role;
ALTER TABLE public.player_themes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage player themes" ON public.player_themes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.player_themes (id, name, grp, image_path, sort) VALUES
 ('middlesbrough','Middlesbrough','Football','middlesbrough.jpg',1),
 ('man-utd','Manchester United','Football','man-utd.jpg',2),
 ('liverpool','Liverpool','Football','liverpool.jpg',3),
 ('arsenal','Arsenal','Football','arsenal.jpg',4),
 ('chelsea','Chelsea','Football','chelsea.jpg',5),
 ('man-city','Manchester City','Football','man-city.jpg',6),
 ('spurs','Tottenham Hotspur','Football','spurs.jpg',7),
 ('newcastle','Newcastle United','Football','newcastle.jpg',8),
 ('sunderland','Sunderland','Football','sunderland.jpg',9),
 ('leeds','Leeds United','Football','leeds.jpg',10),
 ('aston-villa','Aston Villa','Football','aston-villa.jpg',11),
 ('england','England','Football','england.jpg',12),
 ('kids-cartoon','Kids cartoon','Kids','kids-cartoon.jpg',20),
 ('fairy-tale-magic','Fairy tale magic','Kids','fairy-tale-magic.jpg',21),
 ('christmas','Christmas','Seasonal','christmas.jpg',30),
 ('halloween','Halloween','Seasonal','halloween.jpg',31),
 ('valentines','Valentine''s','Seasonal','valentines.jpg',32),
 ('easter','Easter','Seasonal','easter.jpg',33),
 ('bonfire-night','Bonfire Night','Seasonal','bonfire-night.jpg',34),
 ('new-year','New Year','Seasonal','new-year.jpg',35);