import { Check, Crown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { User } from "@supabase/supabase-js";
import { useNavigate } from "@tanstack/react-router";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { useSubscription } from "@/hooks/useSubscription";
import { toast } from "sonner";

const PLANS = [
  { id: "pro_monthly", label: "Mensal", price: "R$ 29,90", detail: "por mês" },
  { id: "pro_semiannual", label: "Semestral", price: "R$ 159", detail: "a cada 6 meses" },
  { id: "pro_annual", label: "Anual", price: "R$ 297", detail: "por ano" },
];

export function UpgradeDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
}) {
  const { openCheckout, loadingPriceId } = usePaddleCheckout();
  const { isPro } = useSubscription(user?.id);
  const navigate = useNavigate();

  async function subscribe(priceId: string) {
    if (!user) {
      toast.error("Entre na sua conta para assinar.");
      return;
    }
    if (isPro) {
      onOpenChange(false);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Crown className="size-5" />
          </div>
          <DialogTitle>
            {isPro ? "Você já é Pro" : "Desbloquear Canvas Narrativo Pro"}
          </DialogTitle>
          <DialogDescription>
            {isPro
              ? "Sua assinatura está ativa. Para trocar de plano, atualizar cartão ou cancelar, use a página da sua conta."
              : "No plano grátis você pode criar 3 mapas com até 30 nós em cada. O Pro libera mapas e nós ilimitados."}
          </DialogDescription>
        </DialogHeader>

        {isPro ? (
          <DialogFooter>
            <Button onClick={() => { onOpenChange(false); navigate({ to: "/account" }); }}>
              Gerenciar assinatura
            </Button>
          </DialogFooter>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              {PLANS.map((plan) => {
                const loading = loadingPriceId === plan.id;
                return (
                  <button
                    key={plan.id}
                    onClick={() => subscribe(plan.id)}
                    disabled={!!loadingPriceId}
                    className="rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary disabled:opacity-60"
                  >
                    <div className="text-sm font-medium">{plan.label}</div>
                    <div className="mt-3 text-2xl font-semibold">{plan.price}</div>
                    <div className="text-xs text-muted-foreground">{plan.detail}</div>
                    <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                      {loading ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                      {loading ? "Abrindo…" : "Assinar agora"}
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground">
              O checkout mostra os meios de pagamento disponíveis para o comprador, incluindo opções locais quando habilitadas.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
