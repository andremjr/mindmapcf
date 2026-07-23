
-- Attach the freemium enforcement functions as real triggers so the limits
-- cannot be bypassed by calling the Data API directly from a browser.

DROP TRIGGER IF EXISTS enforce_mindmap_freemium_limits_ins ON public.mindmaps;
DROP TRIGGER IF EXISTS enforce_mindmap_freemium_limits_upd ON public.mindmaps;
CREATE TRIGGER enforce_mindmap_freemium_limits_ins
  BEFORE INSERT ON public.mindmaps
  FOR EACH ROW EXECUTE FUNCTION public.enforce_mindmap_freemium_limits();
CREATE TRIGGER enforce_mindmap_freemium_limits_upd
  BEFORE UPDATE ON public.mindmaps
  FOR EACH ROW EXECUTE FUNCTION public.enforce_mindmap_freemium_limits();

DROP TRIGGER IF EXISTS enforce_sonic_avatar_limits_ins ON public.sonic_avatars;
CREATE TRIGGER enforce_sonic_avatar_limits_ins
  BEFORE INSERT ON public.sonic_avatars
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sonic_avatar_limits();

-- Keep updated_at fresh on the tables that carry it.
DROP TRIGGER IF EXISTS set_updated_at_mindmaps ON public.mindmaps;
CREATE TRIGGER set_updated_at_mindmaps
  BEFORE UPDATE ON public.mindmaps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_folders ON public.mindmap_folders;
CREATE TRIGGER set_updated_at_folders
  BEFORE UPDATE ON public.mindmap_folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_avatars ON public.sonic_avatars;
CREATE TRIGGER set_updated_at_avatars
  BEFORE UPDATE ON public.sonic_avatars
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_subscriptions ON public.subscriptions;
CREATE TRIGGER set_updated_at_subscriptions
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Prevent duplicate subscription rows per Kiwify subscription (needed by the
-- webhook's ON CONFLICT clause and to stop replay attacks from double-crediting).
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_paddle_subscription_id_key
  ON public.subscriptions (paddle_subscription_id);
