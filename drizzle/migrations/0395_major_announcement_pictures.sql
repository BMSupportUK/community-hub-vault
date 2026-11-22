ALTER TABLE public.player_major_announcements ADD COLUMN IF NOT EXISTS image_path text;
CREATE POLICY "Admin and management upload announcement pictures" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'player-announcements' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management')));
CREATE POLICY "Admin and management delete announcement pictures" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'player-announcements' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management')));