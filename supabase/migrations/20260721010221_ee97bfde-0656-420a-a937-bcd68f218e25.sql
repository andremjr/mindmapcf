
CREATE TABLE public.mindmap_folders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Nova pasta',
  color text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mindmap_folders TO authenticated;
GRANT ALL ON public.mindmap_folders TO service_role;

ALTER TABLE public.mindmap_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "folders_own_select" ON public.mindmap_folders
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "folders_own_insert" ON public.mindmap_folders
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "folders_own_update" ON public.mindmap_folders
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "folders_own_delete" ON public.mindmap_folders
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER mindmap_folders_set_updated_at
  BEFORE UPDATE ON public.mindmap_folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.mindmaps
  ADD COLUMN folder_id uuid REFERENCES public.mindmap_folders(id) ON DELETE SET NULL;

CREATE INDEX mindmaps_user_folder_idx ON public.mindmaps(user_id, folder_id);
CREATE INDEX mindmap_folders_user_idx ON public.mindmap_folders(user_id, position);
