
CREATE TABLE public.mindmaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Novo mapa mental',
  data jsonb NOT NULL DEFAULT '{"nodes":[],"viewport":{"x":0,"y":0,"zoom":1}}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mindmaps TO authenticated;
GRANT ALL ON public.mindmaps TO service_role;

ALTER TABLE public.mindmaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_select" ON public.mindmaps FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own_insert" ON public.mindmaps FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_update" ON public.mindmaps FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_delete" ON public.mindmaps FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX mindmaps_user_updated_idx ON public.mindmaps (user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER mindmaps_updated_at
BEFORE UPDATE ON public.mindmaps
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
