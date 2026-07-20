import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMindmapSync } from "@/lib/mindmapSync";

/**
 * Layout for /projects/*. Owns auth gate + Supabase sync so navigating
 * between the dashboard and the editor does NOT unmount the sync hook
 * (which would cancel debounced upserts and re-hydrate over local state).
 */
export const Route = createFileRoute("/projects")({
  component: ProjectsLayout,
});

function ProjectsLayout() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const { hydrated } = useMindmapSync(session?.user.id);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  if (loading || !session || !hydrated) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  return <Outlet />;
}
