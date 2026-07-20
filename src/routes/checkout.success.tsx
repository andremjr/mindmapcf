import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  return (
    <div className="min-h-screen bg-background grid place-items-center px-4">
      <div className="max-w-md text-center rounded-xl border border-border bg-card p-8">
        <CheckCircle2 className="mx-auto mb-4 size-12 text-primary" />
        <h1 className="text-2xl font-semibold">Assinatura ativada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Seu acesso Pro será liberado automaticamente assim que a confirmação do pagamento chegar.
        </p>
        <Button asChild className="mt-6">
          <Link to="/projects">Voltar aos mapas</Link>
        </Button>
      </div>
    </div>
  );
}