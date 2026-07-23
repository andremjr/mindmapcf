import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Check, Crown, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { SiteFooter } from "@/components/SiteFooter";
import { buildKiwifyCheckoutUrl, type KiwifyPlanId } from "@/lib/kiwifyLinks";

type PlanKey = "monthly" | "semiannual" | "annual";

const PLANS: Record<PlanKey, {
  id: KiwifyPlanId;
  label: string;
  price: string;
  perMonth: string;
  detail: string;
  renewal: string;
  badge: string | null;
}> = {
  monthly: {
    id: "pro_monthly",
    label: "Mensal",
    price: "R$ 29,90",
    perMonth: "R$ 29,90/mês",
    detail: "Cobrado mensalmente",
    renewal: "Renova automaticamente por R$ 29,90/mês até você cancelar.",
    badge: null,
  },
  semiannual: {
    id: "pro_semiannual",
    label: "Semestral",
    price: "R$ 159,90",
    perMonth: "R$ 26,65/mês",
    detail: "Cobrado a cada 6 meses",
    renewal: "Renova automaticamente por R$ 159,90 a cada 6 meses até você cancelar.",
    badge: "Economize ~11%",
  },
  annual: {
    id: "pro_annual",
    label: "Anual",
    price: "R$ 297,00",
    perMonth: "R$ 24,75/mês",
    detail: "Cobrado a cada 12 meses",
    renewal: "Renova automaticamente por R$ 297,00 a cada 12 meses até você cancelar.",
    badge: "Melhor valor",
  },
};

const FEATURES = [
  "Canvas e nós ilimitados",
  "Todos os 6 formatos (mapa, tier list, iceberg, chaveamento, matriz, ranking)",
  "Imagens, vídeos e links embutidos nos nós",
  "Modo apresentação cinematográfico em todos os formatos",
  "Gravação MP4 (1080p, 4K, vertical) integrada",
  "Narração em áudio + avatar sonoro reativo",
  "Importação via IA (Markdown/JSON)",
  "Organização por pastas ilimitadas",
];

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Planos — Canvas Narrativo" },
      { name: "description", content: "Assine o Canvas Narrativo Pro e desbloqueie os 6 formatos, gravação em 4K, narração e avatar sonoro." },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const { user, loading } = useAuth();
  const { isPro } = useSubscription(user?.id);
  const navigate = useNavigate();
  const [selected, setSelected] = useState<PlanKey>("annual");
  const plan = PLANS[selected];

  function subscribe() {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (isPro) {
      navigate({ to: "/account" });
      return;
    }
    const url = buildKiwifyCheckoutUrl(plan.id, user.email);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to={user ? "/projects" : "/"} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Voltar
          </Link>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Network className="size-4 text-primary" /> Canvas Narrativo
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="text-center">
          <h1 className="text-4xl font-semibold tracking-tight">Canvas Narrativo Pro</h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Todas as funcionalidades em um só plano. Escolha a frequência de cobrança que faz sentido para você.
          </p>
        </div>

        {isPro && (
          <div className="mx-auto mt-6 flex max-w-xl items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm">
            <Crown className="size-4 text-primary" />
            <div className="flex-1">Você já é Pro. Para trocar de plano, atualizar cartão ou cancelar, acesse sua conta.</div>
            <Button size="sm" onClick={() => navigate({ to: "/account" })}>Minha conta</Button>
          </div>
        )}

        <div className="mt-10 rounded-2xl border border-border bg-card p-6 md:p-8">
          {/* Toggle */}
          <div className="mx-auto inline-flex w-full rounded-lg border border-border bg-background p-1">
            {(Object.keys(PLANS) as PlanKey[]).map((key) => {
              const active = selected === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelected(key)}
                  className={`relative flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                    active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {PLANS[key].label}
                  {PLANS[key].badge && !active && (
                    <span className="ml-1.5 hidden rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary md:inline">
                      {PLANS[key].badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Price */}
          <div className="mt-8 flex flex-col items-center text-center">
            {plan.badge && (
              <span className="mb-3 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {plan.badge}
              </span>
            )}
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-semibold tracking-tight">{plan.price}</span>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">{plan.detail}</div>
            {selected !== "monthly" && (
              <div className="mt-1 text-xs text-muted-foreground">Equivalente a {plan.perMonth}</div>
            )}
          </div>

          {/* Features */}
          <ul className="mx-auto mt-8 grid max-w-lg gap-2.5 text-sm sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <Button className="mx-auto mt-8 flex w-full max-w-sm" size="lg" onClick={subscribe} disabled={loading}>
            {isPro ? "Gerenciar assinatura" : `Assinar ${plan.label}`}
          </Button>
          <p className="mx-auto mt-3 max-w-sm text-center text-[11px] leading-relaxed text-muted-foreground">
            {plan.renewal}
          </p>
        </div>

        <div className="mt-8 space-y-2 rounded-lg border border-border bg-card/50 p-5 text-xs leading-relaxed text-muted-foreground">
          <p>
            <strong className="text-foreground">Preços em Reais (BRL).</strong> Pagamento processado pela
            Kiwify — cartão de crédito ou Pix disponíveis no checkout.
          </p>
          <p>
            Todas as assinaturas <strong className="text-foreground">renovam automaticamente</strong> ao fim de
            cada ciclo pelo mesmo valor, até que sejam canceladas. Você pode cancelar a qualquer momento em{" "}
            <Link to="/account" className="underline">Minha conta</Link> e mantém o acesso Pro até o fim do
            período já pago.
          </p>
          <p>
            Plano grátis permanente com 3 canvas (formato mapa mental) e 30 nós por canvas — sem cartão de crédito.
          </p>
          <p>
            Consulte nossa{" "}
            <Link to="/refund" className="underline">Política de Reembolso</Link> (garantia de 7 dias) e os{" "}
            <Link to="/terms" className="underline">Termos de Uso</Link>.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
