import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useProject } from "@/lib/store";
import { EditorLayout } from "@/components/editor/EditorLayout";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/projects/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Editor — Canvas Narrativo` },
      { name: "description", content: `Editor do projeto ${params.id}.` },
    ],
  }),
  component: EditorRoute,
});

function EditorRoute() {
  const { id } = useParams({ from: "/projects/$id" });
  const project = useProject(id);

  if (!project) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="surface-card p-8 text-center max-w-sm">
          <h2 className="text-display text-lg mb-2">Projeto não encontrado</h2>
          <p className="text-sm text-muted-foreground mb-4">Talvez tenha sido excluído.</p>
          <Button asChild><Link to="/projects">Voltar</Link></Button>
        </div>
      </div>
    );
  }

  return <EditorLayout project={project} />;
}
