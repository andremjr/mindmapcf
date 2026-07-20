import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Camera, Check, Network, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Canvas Narrativo — Mapas mentais cinematográficos" },
      {
        name: "description",
        content:
          "Crie mapas mentais visuais com imagens e vídeos, apresente com câmera cinematográfica e grave em MP4 pronto para publicar.",
      },
      { property: "og:title", content: "Canvas Narrativo — Mapas mentais cinematográficos" },
      {
        property: "og:description",
        content:
          "Transforme ideias em mapas mentais visuais com apresentação cinematográfica e gravação embutida.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <img src="/favicon.png" alt="Canvas Narrativo" className="size-6" /> Canvas Narrativo
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/pricing" className="text-muted-foreground hover:text-foreground">
              Planos
            </Link>
            <Link to="/auth">
              <Button size="sm">Entrar</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="size-3 text-primary" /> Mapas mentais que viram vídeo
            </div>
            <h1 className="mt-6 text-5xl font-semibold tracking-tight sm:text-6xl">
              Transforme ideias em mapas mentais cinematográficos.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              Estruture pensamentos em um quadro infinito, adicione imagens e vídeos aos nós, e apresente
              com câmera automática — gravando um MP4 pronto para publicar.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth">
                <Button size="lg">
                  Começar grátis <ArrowRight className="ml-2 size-4" />
                </Button>
              </Link>
              <Link to="/pricing">
                <Button size="lg" variant="outline">
                  Ver planos
                </Button>
              </Link>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Grátis com 3 mapas e 30 nós por mapa. Sem cartão de crédito.
            </p>
          </div>
        </section>

        <section className="border-t border-border bg-card/30">
          <div className="mx-auto grid max-w-6xl gap-6 px-6 py-16 md:grid-cols-3">
            <Feature
              icon={<Network className="size-5 text-primary" />}
              title="Quadro infinito"
              text="Ramifique ideias com atalhos de teclado: Tab para filho, Enter para irmão, F2 para editar."
            />
            <Feature
              icon={<Play className="size-5 text-primary" />}
              title="Apresentação cinematográfica"
              text="Câmera automática percorre a árvore com zoom e transições suaves. Vídeos e imagens embutidos."
            />
            <Feature
              icon={<Camera className="size-5 text-primary" />}
              title="Gravação em MP4"
              text="Grave apenas o quadro do mapa em 1080p, 4K ou vertical — sem ferramentas externas."
            />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-3xl font-semibold tracking-tight">Como funciona</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            <Step n={1} title="Crie seu mapa" text="Comece com um nó raiz e ramifique conforme o pensamento flui." />
            <Step n={2} title="Enriqueça com mídia" text="Adicione imagens e vídeos a qualquer nó, com cores por ramificação." />
            <Step n={3} title="Apresente e grave" text="Ative o modo apresentação e capture a tela como vídeo final." />
          </ol>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-6 py-16 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Pronto para começar?</h2>
            <p className="mt-3 text-muted-foreground">Grátis para sempre no plano básico. Assine quando precisar de mais.</p>
            <div className="mt-6 flex justify-center gap-3">
              <Link to="/auth">
                <Button size="lg">Criar conta grátis</Button>
              </Link>
              <Link to="/pricing">
                <Button size="lg" variant="outline">Ver planos <Check className="ml-2 size-4" /></Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">{icon}</div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <li className="rounded-xl border border-border bg-card p-6">
      <div className="text-xs font-mono text-primary">Passo {n}</div>
      <h3 className="mt-2 font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </li>
  );
}
