
CREATE OR REPLACE FUNCTION public.enforce_mindmap_freemium_limits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  node_count integer;
  map_count integer;
  tpl text;
  is_pro boolean;
BEGIN
  is_pro := public.user_has_any_active_subscription(NEW.user_id);
  tpl := COALESCE(NEW.data->>'template', 'mindmap');

  -- Non-mindmap templates (tierlist, iceberg) are a Pro feature.
  IF NOT is_pro AND tpl <> 'mindmap' THEN
    RAISE EXCEPTION 'PRO_REQUIRED_FOR_TEMPLATE';
  END IF;

  IF is_pro THEN
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
$function$;
