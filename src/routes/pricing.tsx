import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Crown, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { SiteFooter } from "@/components/SiteFooter";
import { buildKiwifyCheckoutUrl, type KiwifyPlanId } from "@/lib/kiwifyLinks";

const PLANS: Array<{
  id: KiwifyPlanId;
  label: string;
  price: string;
  detail: string;
  renewal: string;
  effective: string | null;
}> = [
  {
    id: "pro_monthly",
    label: "Mensal",
    price: "R$ 29,90",
    detail: "por mês, cobrado mensalmente",
    renewal: "Renova automaticamente por R$ 29,90/mês até você cancelar.",
    effective: null,
  },
  {
    id: "pro_semiannual",
    label: "Semestral",
    price: "R$ 159,90",
    detail: "a cada 6 meses (equivalente a R$ 26,65/mês)",
    renewal: "Renova automaticamente por R$ 159,90 a cada 6 meses até você cancelar.",
    effective: "Economize ~11% vs. mensal",
  },
  {
    id: "pro_annual",
    label: "Anual",
    price: "R$ 297,00",
    detail: "por ano (equivalente a R$ 24,75/mês)",
    renewal: "Renova automaticamente por R$ 297,00 a cada 12 meses até você cancelar.",
    effective: "Economize ~17% vs. mensal",
  },
];

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Planos — Canvas Narrativo" },
      { name: "description", content: "Assine o Canvas Narrativo Pro para criar mapas e nós ilimitados." },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const { user, loading } = useAuth();
  const { isPro } = useSubscription(user?.id);
  const navigate = useNavigate();

  function subscribe(planId: KiwifyPlanId) {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (isPro) {
      navigate({ to: "/account" });
      return;
    }
    const url = buildKiwifyCheckoutUrl(planId, user.email);
    window.location.href = url;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Voltar ao início
          </Link>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Network className="size-4 text-primary" /> Canvas Narrativo
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-semibold tracking-tight">Canvas Narrativo Pro</h1>
          <p className="mt-3 text-muted-foreground">
            Ferramenta web para criação de mapas mentais com imagens, vídeos, modo apresentação com câmera
            cinematográfica e gravação em MP4. Comece grátis com até 3 mapas e 30 nós por mapa. Assine o
            <strong> Pro</strong> para desbloquear mapas e nós ilimitados.
          </p>
          {isPro && (
            <div className="mt-6 flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm">
              <Crown className="size-4 text-primary" />
              <div className="flex-1">Você já é Pro. Para trocar de plano, atualizar cartão ou cancelar, acesse sua conta.</div>
              <Button size="sm" onClick={() => navigate({ to: "/account" })}>Minha conta</Button>
            </div>
          )}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div key={plan.id} className="flex flex-col rounded-xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Canvas Narrativo Pro — {plan.label}</div>
                {plan.effective && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {plan.effective}
                  </span>
                )}
              </div>
              <div className="mt-4 text-3xl font-semibold">{plan.price}</div>
              <div className="text-sm text-muted-foreground">{plan.detail}</div>
              <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><Check className="mt-0.5 size-4 text-primary" /> Mapas mentais ilimitados</li>
                <li className="flex gap-2"><Check className="mt-0.5 size-4 text-primary" /> Nós ilimitados por mapa</li>
                <li className="flex gap-2"><Check className="mt-0.5 size-4 text-primary" /> Imagens e vídeos nos nós</li>
                <li className="flex gap-2"><Check className="mt-0.5 size-4 text-primary" /> Modo apresentação cinematográfico</li>
                <li className="flex gap-2"><Check className="mt-0.5 size-4 text-primary" /> Gravação MP4 (1080p, 4K, vertical)</li>
                <li className="flex gap-2"><Check className="mt-0.5 size-4 text-primary" /> Importação via IA (Markdown/JSON)</li>
              </ul>
              <Button className="mt-6 w-full" onClick={() => subscribe(plan.id)} disabled={loading}>
                Assinar {plan.label}
              </Button>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{plan.renewal}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 space-y-2 rounded-lg border border-border bg-card/50 p-5 text-xs leading-relaxed text-muted-foreground">
          <p>
            <strong className="text-foreground">Preços em Reais (BRL).</strong> Pagamento processado pela
            Kiwify — cartão de crédito, Pix e boleto disponíveis no checkout.
          </p>
          <p>
            Todas as assinaturas <strong className="text-foreground">renovam automaticamente</strong> ao fim de
            cada ciclo pelo mesmo valor, até que sejam canceladas. Você pode cancelar a qualquer momento em{" "}
            <Link to="/account" className="underline">Minha conta</Link> e mantém o acesso Pro até o fim do
            período já pago.
          </p>
          <p>
            Não oferecemos período de teste pago — o plano grátis (3 mapas, 30 nós por mapa) é permanente e sem
            cartão de crédito.
          </p>
          <p>
            Consulte também nossa{" "}
            <Link to="/refund" className="underline">Política de Reembolso</Link> (garantia de 7 dias) e os{" "}
            <Link to="/terms" className="underline">Termos de Uso</Link>.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
