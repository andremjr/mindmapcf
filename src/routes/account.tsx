import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Crown, ExternalLink, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { KIWIFY_CUSTOMER_PORTAL } from "@/lib/kiwifyLinks";

const PLAN_LABEL: Record<string, string> = {
  pro_monthly: "Mensal — R$ 29,90/mês",
  pro_semiannual: "Semestral — R$ 159,90/6 meses",
  pro_annual: "Anual — R$ 297/ano",
};

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Minha conta — Canvas Narrativo" },
      { name: "description", content: "Gerencie sua assinatura Canvas Narrativo Pro." },
    ],
  }),
  component: AccountPage,
});

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return "—";
  }
}

function AccountPage() {
  const { user, session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { subscription, loading: subLoading, isPro } = useSubscription(user?.id);

  const initialName =
    ((user?.user_metadata as { display_name?: string } | null)?.display_name ?? "").trim();
  const [displayName, setDisplayName] = useState(initialName);
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    setDisplayName(
      ((user?.user_metadata as { display_name?: string } | null)?.display_name ?? "").trim(),
    );
  }, [user?.id, user?.user_metadata]);

  useEffect(() => {
    if (!authLoading && !session) navigate({ to: "/auth", replace: true });
  }, [authLoading, session, navigate]);

  if (authLoading || !session) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Carregando…</div>;
  }

  const currentPriceId = subscription?.price_id;
  const status = subscription?.status;
  const isCanceled = status === "canceled";
  const isPastDue = status === "past_due";
  const greetingName = displayName.trim() || user?.email;
  const nameDirty = displayName.trim() !== initialName;

  async function saveDisplayName() {
    const trimmed = displayName.trim().slice(0, 60);
    setSavingName(true);
    const { error } = await supabase.auth.updateUser({ data: { display_name: trimmed } });
    setSavingName(false);
    if (error) {
      toast.error("Não foi possível salvar seu nome");
      return;
    }
    toast.success("Nome atualizado");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link to="/projects" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Voltar
          </Link>
          <div className="text-sm font-semibold">Minha conta</div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10 space-y-8">
        <section>
          <h1 className="text-2xl font-semibold">Olá, {greetingName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie seu nome de exibição, assinatura e faturas.
          </p>
        </section>

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold">Nome de exibição</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Aparece no topo do app. Deixe em branco para voltar a mostrar seu e-mail.
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <Label htmlFor="display-name" className="text-xs text-muted-foreground">
                Nome
              </Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={60}
                placeholder="Como você quer ser chamado"
                className="mt-1"
              />
            </div>
            <Button onClick={saveDisplayName} disabled={savingName || !nameDirty} className="gap-2">
              {savingName ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Salvar
            </Button>
          </div>
        </section>
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Crown className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Plano atual</div>
              <div className="text-lg font-semibold">
                {subLoading
                  ? "Carregando…"
                  : isPro
                    ? PLAN_LABEL[currentPriceId ?? ""] ?? "Pro"
                    : "Grátis (3 mapas, 30 nós)"}
              </div>
            </div>
          </div>

          {isPro && (
            <dl className="mt-6 grid gap-4 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium">
                  {isPastDue ? (
                    <span className="text-orange-500">Pagamento pendente — atualize o cartão</span>
                  ) : isCanceled ? (
                    <span className="text-orange-500">Cancelada — acesso até o fim do período</span>
                  ) : (
                    <span>Ativa</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {isCanceled ? "Acesso até" : "Próxima cobrança"}
                </dt>
                <dd className="font-medium">{formatDate(subscription?.current_period_end)}</dd>
              </div>
            </dl>
          )}
        </section>

        {isPro && (
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-base font-semibold">Gerenciar assinatura</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              O pagamento é processado pela <strong>Kiwify</strong>. Para atualizar cartão, mudar plano,
              baixar faturas ou cancelar, acesse a área do cliente da Kiwify com o mesmo e-mail usado na
              compra (<strong>{user?.email}</strong>).
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild>
                <a href={KIWIFY_CUSTOMER_PORTAL} target="_blank" rel="noopener noreferrer">
                  Abrir área do cliente Kiwify
                  <ExternalLink className="ml-2 size-3.5" />
                </a>
              </Button>
              <Button variant="outline" onClick={() => navigate({ to: "/pricing" })}>
                Ver planos
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Ao cancelar você mantém o acesso Pro até o fim do período já pago. Depois disso a conta volta
              automaticamente para o plano grátis.
            </p>
          </section>
        )}

        {!isPro && !subLoading && (
          <section className="rounded-xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">Você está no plano grátis.</p>
            <Button className="mt-4" onClick={() => navigate({ to: "/pricing" })}>
              Ver planos Pro <ExternalLink className="size-3 ml-1" />
            </Button>
          </section>
        )}
      </main>
    </div>
  );
}
