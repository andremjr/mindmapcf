import { createFileRoute, Link, useParams } from "@tanstack/react-router";
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

  return <MindMapEditor project={project} />;
}

