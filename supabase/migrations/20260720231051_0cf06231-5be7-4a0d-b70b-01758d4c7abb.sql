
-- Own-folder RLS policies for the `avatar-images` storage bucket.
CREATE POLICY "avatar-images own select"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatar-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "avatar-images own insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatar-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "avatar-images own update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatar-images' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'avatar-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "avatar-images own delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatar-images' AND auth.uid()::text = (storage.foldername(name))[1]);
