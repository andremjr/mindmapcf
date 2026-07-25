import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Camera,
  Check,
  Sparkles,
  Network,
  ListOrdered,
  Trophy,
  Grid3x3,
  Waves,
  Layers,
  Mic,
  Play,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Canvas Narrativo — Formatos visuais para vídeos envolventes" },
      {
        name: "description",
        content:
          "Crie mapas mentais, tier lists, icebergs, chaveamentos, matrizes, rankings e comparações de escala 3D. Apresente com câmera cinematográfica e grave o vídeo pronto para o YouTube.",
      },
      { property: "og:title", content: "Canvas Narrativo — Formatos visuais para vídeos envolventes" },
      {
        property: "og:description",
        content:
          "Sete formatos narrativos com apresentação cinematográfica e gravação embutida — pensados para YouTube, TikTok e Shorts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const FORMATS = [
  { icon: Network, label: "Mapa mental", desc: "Árvore infinita com ramificações." },
  { icon: Layers, label: "Tier List", desc: "Classifique em S, A, B, C, D." },
  { icon: Waves, label: "Iceberg", desc: "Níveis de profundidade explorados um a um." },
  { icon: Trophy, label: "Chaveamento", desc: "Torneio eliminatório com vencedores." },
  { icon: Grid3x3, label: "Matriz 2×2", desc: "Posicione cards em dois eixos." },
  { icon: ListOrdered, label: "Ranking", desc: "Lista ordenada com revelação progressiva." },
  { icon: BarChart3, label: "Comparação de escala", desc: "Pedestais 3D em escala real, no estilo dos vídeos virais." },
];

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
              <Sparkles className="size-3 text-primary" /> Formatos narrativos que engajam no YouTube
            </div>
            <h1 className="mt-6 text-5xl font-semibold tracking-tight sm:text-6xl">
              Transforme ideias em vídeos visuais e envolventes.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              Escolha entre sete formatos — mapa mental, tier list, iceberg, chaveamento, matriz,
              ranking e comparação de escala 3D — e apresente com câmera cinematográfica gravando
              o vídeo pronto para publicar.
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
              Grátis com 3 canvas e 30 nós por canvas. Sem cartão de crédito.
            </p>
          </div>
        </section>

        <section className="border-t border-border bg-card/30">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="text-3xl font-semibold tracking-tight">Sete formatos, um só app</h2>
            <p className="mt-2 text-muted-foreground">
              Cada formato tem seu próprio editor e modo de apresentação — todos com gravação, avatar sonoro e narração.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FORMATS.map((f) => (
                <div key={f.label} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                    <f.icon className="size-4 text-primary" />
                  </div>
                  <h3 className="mt-3 font-semibold">{f.label}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-3xl font-semibold tracking-tight">O que vem incluso em cada canvas</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <Feature
              icon={<Play className="size-5 text-primary" />}
              title="Apresentação cinematográfica"
              text="Câmera automática entre elementos, com zoom e transições suaves."
            />
            <Feature
              icon={<Camera className="size-5 text-primary" />}
              title="Gravação embutida"
              text="Capture o quadro em 720p, Full HD, 4K, quadrado ou vertical — sem OBS, sem edição."
            />
            <Feature
              icon={<Mic className="size-5 text-primary" />}
              title="Narração e avatar sonoro"
              text="Suba o áudio pronto ou grave junto. Avatar reage às ondas sonoras."
            />
          </div>
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
