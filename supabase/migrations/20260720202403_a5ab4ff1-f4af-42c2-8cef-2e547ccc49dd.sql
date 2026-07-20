CREATE OR REPLACE FUNCTION public.user_has_any_active_subscription(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions
    WHERE user_id = _user_id
      AND environment IN ('sandbox', 'live')
      AND (
        (status IN ('active', 'trialing', 'past_due') AND (current_period_end IS NULL OR current_period_end > now()))
        OR (status = 'canceled' AND current_period_end > now())
      )
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_any_active_subscription(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_has_any_active_subscription(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.user_has_any_active_subscription(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_any_active_subscription(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_mindmap_freemium_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  node_count integer;
  map_count integer;
BEGIN
  IF public.user_has_any_active_subscription(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  node_count := COALESCE(jsonb_array_length(COALESCE(NEW.data->'nodes', '[]'::jsonb)), 0);
  IF node_count > 30 THEN
    RAISE EXCEPTION 'FREE_NODE_LIMIT_EXCEEDED';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT count(*) INTO map_count
    FROM public.mindmaps
    WHERE user_id = NEW.user_id;

    IF map_count >= 3 THEN
      RAISE EXCEPTION 'FREE_MAP_LIMIT_EXCEEDED';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_mindmap_freemium_limits() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_mindmap_freemium_limits() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_mindmap_freemium_limits() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_mindmap_freemium_limits() TO service_role;

DROP TRIGGER IF EXISTS enforce_mindmap_freemium_limits ON public.mindmaps;
CREATE TRIGGER enforce_mindmap_freemium_limits
  BEFORE INSERT OR UPDATE ON public.mindmaps
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_mindmap_freemium_limits();