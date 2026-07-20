import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { useProject } from "@/lib/store";
import { MindMapEditor } from "@/components/mindmap/MindMapEditor";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useMindmapSync } from "@/lib/mindmapSync";


export const Route = createFileRoute("/projects/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Editor — Canvas Narrativo` },
      { name: "description", content: `Mapa mental ${params.id}.` },
    ],
  }),
  component: EditorRoute,
});

function EditorRoute() {
  const { id } = useParams({ from: "/projects/$id" });
  const project = useProject(id);
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useMindmapSync(session?.user.id);


  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Carregando…</div>;
  }

  if (!project) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="rounded-xl border border-border/60 bg-card p-8 text-center max-w-sm">
          <h2 className="text-lg font-semibold mb-2">Mapa não encontrado</h2>
          <p className="text-sm text-muted-foreground mb-4">Talvez tenha sido excluído.</p>
          <Button asChild><Link to="/projects">Voltar</Link></Button>
        </div>
      </div>
    );
  }

  return <MindMapEditor project={project} />;
}

