import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";

export const Route = createFileRoute("/checkout/success")({
  head: () => ({
    meta: [
      { title: "Assinatura confirmada — Canvas Narrativo" },
      { name: "description", content: "Sua assinatura Pro foi confirmada." },
    ],
  }),
  component: CheckoutSuccess,
});

function CheckoutSuccess() {
  const { user } = useAuth();
  const { isPro, loading } = useSubscription(user?.id);
  const [waited, setWaited] = useState(0);
  const navigate = useNavigate();

  // Poll perception: increment every 2s so the UI can show "still processing" fallback.
  useEffect(() => {
    if (isPro) return;
    const t = setInterval(() => setWaited((w) => w + 1), 2000);
    return () => clearInterval(t);
  }, [isPro]);

  useEffect(() => {
    if (!isPro) return;
    const t = setTimeout(() => navigate({ to: "/projects" }), 2000);
    return () => clearTimeout(t);
  }, [isPro, navigate]);

  const stillWaiting = !isPro && !loading;

  return (
    <div className="min-h-screen bg-background grid place-items-center px-4">
      <div className="max-w-md text-center rounded-xl border border-border bg-card p-8">
        {isPro ? (
          <>
            <CheckCircle2 className="mx-auto mb-4 size-12 text-primary" />
            <h1 className="text-2xl font-semibold">Assinatura ativada</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Seu acesso Pro já está liberado. Levando você aos mapas…
            </p>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto mb-4 size-12 text-primary animate-spin" />
            <h1 className="text-2xl font-semibold">Confirmando pagamento</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Estamos aguardando a confirmação do pagamento. Isso costuma levar poucos segundos.
            </p>
            {waited > 8 && (
              <p className="mt-4 text-xs text-muted-foreground">
                Está demorando mais que o esperado. Você pode voltar aos mapas — o acesso será liberado assim que o pagamento for confirmado.
              </p>
            )}
          </>
        )}
        <Button asChild className="mt-6" variant={stillWaiting ? "outline" : "default"}>
          <Link to="/projects">Ir para meus mapas</Link>
        </Button>
      </div>
    </div>
  );
}
