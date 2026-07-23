
DROP TRIGGER IF EXISTS enforce_mindmap_freemium_limits_trigger ON public.mindmaps;
CREATE TRIGGER enforce_mindmap_freemium_limits_trigger
  BEFORE INSERT OR UPDATE ON public.mindmaps
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_mindmap_freemium_limits();
