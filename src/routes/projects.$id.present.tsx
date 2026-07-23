import { createFileRoute, Link, useParams, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { useProject } from "@/lib/store";
import { Presentation } from "@/components/mindmap/Presentation";
import { TierListPresentation } from "@/components/tierlist/TierListPresentation";
import { IcebergPresentation } from "@/components/iceberg/IcebergPresentation";
import { Button } from "@/components/ui/button";

const searchSchema = z.object({
  record: z.union([z.literal("1"), z.literal("0"), z.boolean()]).optional(),
});

export const Route = createFileRoute("/projects/$id/present")({
  validateSearch: searchSchema,
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
  const search = useSearch({ from: "/projects/$id/present" });
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

  const recording = search.record === "1" || search.record === true;
  const template = project.template ?? "mindmap";
  if (template === "tierlist") return <TierListPresentation project={project} recording={recording} />;
  if (template === "iceberg") return <IcebergPresentation project={project} recording={recording} />;
  return <Presentation project={project} recording={recording} />;
}
