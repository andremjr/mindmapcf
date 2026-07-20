
CREATE TABLE public.sonic_avatars (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Avatar',
  image_ref jsonb,
  bg_color text NOT NULL DEFAULT '#0f172a',
  wave_color text NOT NULL DEFAULT '#22d3ee',
  size_pct integer NOT NULL DEFAULT 18,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sonic_avatars TO authenticated;
GRANT ALL ON public.sonic_avatars TO service_role;

ALTER TABLE public.sonic_avatars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "avatars_own_select" ON public.sonic_avatars
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "avatars_own_insert" ON public.sonic_avatars
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "avatars_own_update" ON public.sonic_avatars
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "avatars_own_delete" ON public.sonic_avatars
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_sonic_avatars_updated_at
  BEFORE UPDATE ON public.sonic_avatars
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_sonic_avatar_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  avatar_count integer;
BEGIN
  IF NOT public.user_has_any_active_subscription(NEW.user_id) THEN
    RAISE EXCEPTION 'PRO_REQUIRED_FOR_AVATAR';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT count(*) INTO avatar_count
    FROM public.sonic_avatars
    WHERE user_id = NEW.user_id;

    IF avatar_count >= 10 THEN
      RAISE EXCEPTION 'AVATAR_LIMIT_EXCEEDED';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_sonic_avatar_limits
  BEFORE INSERT ON public.sonic_avatars
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sonic_avatar_limits();
