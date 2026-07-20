import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useProject } from "@/lib/store";
import { Presentation } from "@/components/mindmap/Presentation";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/projects/$id/present")({
  head: () => ({
    meta: [
      { title: `Apresentação — Canvas Narrativo` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PresentRoute,
});

function PresentRoute() {
  const { id } = useParams({ from: "/projects/$id/present" });
  const project = useProject(id);

  if (!project) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="rounded-xl border border-border/60 bg-card p-8 text-center max-w-sm">
          <h2 className="text-lg font-semibold mb-2">Mapa não encontrado</h2>
          <Button asChild><Link to="/projects">Voltar</Link></Button>
        </div>
      </div>
    );
  }

  return <Presentation project={project} />;
}
