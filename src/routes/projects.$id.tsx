import { createFileRoute, Link, Outlet, useParams, useRouterState } from "@tanstack/react-router";
import { useProject } from "@/lib/store";
import { MindMapEditor } from "@/components/mindmap/MindMapEditor";
import { Button } from "@/components/ui/button";


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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const project = useProject(id);

  // Auth + Supabase hydration guaranteed by /projects layout.
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

  if (pathname.endsWith("/present")) return <Outlet />;

  return <MindMapEditor project={project} />;
}

