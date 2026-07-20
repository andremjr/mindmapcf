-- Kiwify migration: environment now defaults to 'live' (Kiwify has no sandbox)
ALTER TABLE public.subscriptions ALTER COLUMN environment SET DEFAULT 'live';

-- Helper to lookup user id by email inside the webhook handler
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(_email text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_user_id_by_email(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;