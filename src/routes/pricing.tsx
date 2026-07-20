import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Crown, Loader2, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { useSubscription } from "@/hooks/useSubscription";
import { SiteFooter } from "@/components/SiteFooter";
import { toast } from "sonner";

const PLANS = [
  { id: "pro_monthly", label: "Mensal", price: "R$ 29,90", detail: "por mês" },
  { id: "pro_semiannual", label: "Semestral", price: "R$ 159", detail: "a cada 6 meses" },
  { id: "pro_annual", label: "Anual", price: "R$ 297", detail: "por ano" },
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
  const { openCheckout, loadingPriceId } = usePaddleCheckout();
  const { isPro } = useSubscription(user?.id);
  const navigate = useNavigate();

  async function subscribe(priceId: string) {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (isPro) {
      navigate({ to: "/account" });
      return;
    }
    try {
      await openCheckout({
        priceId,
        customerEmail: user.email,
        customData: { userId: user.id },
        successUrl: `${window.location.origin}/checkout/success`,
      });
    } catch (error: any) {
      console.error("[payments] checkout", error);
      toast.error(error?.message ?? "Não foi possível abrir o pagamento.");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/projects" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Voltar
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
            Comece grátis com 3 mapas e 30 nós por mapa. Assine para criar mapas e nós ilimitados, com apresentação e gravação completas.
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
          {PLANS.map((plan) => {
            const isLoading = loading || loadingPriceId === plan.id;
            return (
              <div key={plan.id} className="rounded-xl border border-border bg-card p-6">
                <div className="text-sm font-medium">{plan.label}</div>
                <div className="mt-4 text-3xl font-semibold">{plan.price}</div>
                <div className="text-sm text-muted-foreground">{plan.detail}</div>
                <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2"><Check className="mt-0.5 size-4 text-primary" /> Mapas ilimitados</li>
                  <li className="flex gap-2"><Check className="mt-0.5 size-4 text-primary" /> Nós ilimitados</li>
                  <li className="flex gap-2"><Check className="mt-0.5 size-4 text-primary" /> Imagens, vídeos e gravação</li>
                </ul>
                <Button className="mt-6 w-full" onClick={() => subscribe(plan.id)} disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Assinar
                </Button>
              </div>
            );
          })}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}