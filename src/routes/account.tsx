import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Crown, Loader2, CreditCard, RotateCcw, Ban, Repeat, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { getPaddleEnvironment, initializePaddle } from "@/lib/paddle";
import {
  cancelSubscription,
  changeSubscriptionPlan,
  getSubscriptionDetail,
  getUpdatePaymentTxn,
  listMyTransactions,
  resumeSubscription,
} from "@/lib/subscription.functions";

const PLAN_LABEL: Record<string, string> = {
  pro_monthly: "Mensal — R$ 29,90/mês",
  pro_semiannual: "Semestral — R$ 159/6 meses",
  pro_annual: "Anual — R$ 297/ano",
};

const CHANGE_OPTIONS = [
  { id: "pro_monthly", label: "Mensal", price: "R$ 29,90/mês" },
  { id: "pro_semiannual", label: "Semestral", price: "R$ 159/6m" },
  { id: "pro_annual", label: "Anual", price: "R$ 297/ano" },
];

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

function formatMoney(amount?: string | null, currency = "BRL") {
  if (!amount) return "—";
  const cents = Number(amount);
  if (!Number.isFinite(cents)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
}

function AccountPage() {
  const { user, session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const environment = getPaddleEnvironment();
  const { subscription, loading: subLoading, isPro } = useSubscription(user?.id);
  const [subId, setSubId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    if (!authLoading && !session) navigate({ to: "/auth", replace: true });
  }, [authLoading, session, navigate]);

  // Fetch the paddle_subscription_id (not exposed by useSubscription)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("subscriptions")
        .select("paddle_subscription_id, paddle_customer_id, status")
        .eq("user_id", user.id)
        .eq("environment", environment)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setSubId(data?.paddle_subscription_id ?? null);
    })();
  }, [user, environment, subscription?.status]);

  // Load Paddle-side details + transactions
  useEffect(() => {
    if (!subId || subId.startsWith("manual_")) return;
    setDetailLoading(true);
    (async () => {
      try {
        const [d, tx] = await Promise.all([
          getSubscriptionDetail({ data: { subscriptionId: subId, environment } }),
          listMyTransactions({ data: { environment } }),
        ]);
        setDetail(d);
        setTransactions(tx.transactions ?? []);
      } catch (err: any) {
        console.error("[account] detail", err);
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [subId, environment]);

  async function handleCancel() {
    if (!subId) return;
    if (!confirm("Cancelar a assinatura? Você mantém o acesso até o fim do período pago.")) return;
    setBusy("cancel");
    try {
      await cancelSubscription({ data: { subscriptionId: subId, environment } });
      toast.success("Assinatura cancelada. Acesso mantido até o fim do período.");
      // reload detail
      const d = await getSubscriptionDetail({ data: { subscriptionId: subId, environment } });
      setDetail(d);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao cancelar.");
    } finally {
      setBusy(null);
    }
  }

  async function handleResume() {
    if (!subId) return;
    setBusy("resume");
    try {
      await resumeSubscription({ data: { subscriptionId: subId, environment } });
      toast.success("Cancelamento revertido.");
      const d = await getSubscriptionDetail({ data: { subscriptionId: subId, environment } });
      setDetail(d);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao reativar.");
    } finally {
      setBusy(null);
    }
  }

  async function handleChangePlan(newPriceExternalId: string) {
    if (!subId) return;
    if (!confirm(`Trocar para o plano ${PLAN_LABEL[newPriceExternalId]}? A cobrança será proporcional imediatamente.`)) return;
    setBusy(`change-${newPriceExternalId}`);
    try {
      await changeSubscriptionPlan({ data: { subscriptionId: subId, newPriceExternalId, environment } });
      toast.success("Plano atualizado.");
      const d = await getSubscriptionDetail({ data: { subscriptionId: subId, environment } });
      setDetail(d);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao trocar plano.");
    } finally {
      setBusy(null);
    }
  }

  async function handleUpdatePayment() {
    if (!subId) return;
    setBusy("payment");
    try {
      const { transactionId } = await getUpdatePaymentTxn({ data: { subscriptionId: subId, environment } });
      await initializePaddle();
      (window as any).Paddle.Checkout.open({
        transactionId,
        settings: {
          displayMode: "overlay",
          allowLogout: false,
          successUrl: `${window.location.origin}/account`,
        },
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao atualizar cartão.");
    } finally {
      setBusy(null);
    }
  }

  if (authLoading || !session) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Carregando…</div>;
  }

  const isManualGrant = subId?.startsWith("manual_") ?? false;
  const currentPriceId = subscription?.price_id;
  const scheduledCancel = detail?.scheduledChange?.action === "cancel";

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
          <h1 className="text-2xl font-semibold">Olá, {user?.email}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie sua assinatura, meio de pagamento e faturas.
          </p>
        </section>

        <section className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Crown className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Plano atual</div>
              <div className="text-lg font-semibold">
                {subLoading ? "Carregando…" : isPro ? PLAN_LABEL[currentPriceId ?? ""] ?? "Pro" : "Grátis (3 mapas, 30 nós)"}
              </div>
            </div>
          </div>

          {isPro && (
            <dl className="mt-6 grid gap-4 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium">
                  {subscription?.status === "past_due" ? (
                    <span className="text-orange-500">Pagamento pendente — atualize o cartão</span>
                  ) : scheduledCancel ? (
                    <span className="text-orange-500">Cancelamento agendado</span>
                  ) : (
                    <span className="capitalize">{subscription?.status ?? "—"}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {scheduledCancel || subscription?.status === "canceled" ? "Acesso até" : "Próxima cobrança"}
                </dt>
                <dd className="font-medium">
                  {formatDate(detail?.nextBilledAt ?? subscription?.current_period_end)}
                </dd>
              </div>
            </dl>
          )}

          {isManualGrant && (
            <p className="mt-4 rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
              Este acesso Pro foi concedido manualmente e não está vinculado a uma assinatura ativa no Paddle. Ações abaixo ficam indisponíveis.
            </p>
          )}
        </section>

        {isPro && !isManualGrant && (
          <>
            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-base font-semibold">Ações da assinatura</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Button
                  variant="outline"
                  onClick={handleUpdatePayment}
                  disabled={busy !== null}
                  className="justify-start gap-2"
                >
                  {busy === "payment" ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
                  Atualizar cartão
                </Button>
                {scheduledCancel || subscription?.status === "canceled" ? (
                  <Button
                    variant="default"
                    onClick={handleResume}
                    disabled={busy !== null}
                    className="justify-start gap-2"
                  >
                    {busy === "resume" ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                    Reativar assinatura
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    disabled={busy !== null}
                    className="justify-start gap-2 text-destructive hover:text-destructive"
                  >
                    {busy === "cancel" ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
                    Cancelar assinatura
                  </Button>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Repeat className="size-4" /> Trocar de plano
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                A cobrança nova é feita imediatamente com valor proporcional ao restante do período.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {CHANGE_OPTIONS.map((opt) => {
                  const isCurrent = currentPriceId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => handleChangePlan(opt.id)}
                      disabled={isCurrent || busy !== null || detailLoading}
                      className="rounded-lg border border-border bg-background p-4 text-left transition hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="mt-2 text-xs text-muted-foreground">{opt.price}</div>
                      <div className="mt-3 text-xs">
                        {isCurrent ? (
                          <span className="text-primary">Plano atual</span>
                        ) : busy === `change-${opt.id}` ? (
                          <span className="inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> Trocando…</span>
                        ) : (
                          <span className="text-muted-foreground">Selecionar</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-base font-semibold">Histórico de cobranças</h2>
              {transactions.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  {detailLoading ? "Carregando…" : "Nenhuma cobrança ainda."}
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-border text-sm">
                  {transactions.map((t) => (
                    <li key={t.id} className="flex items-center justify-between py-3">
                      <div>
                        <div className="font-medium">{formatMoney(t.total, t.currency)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(t.billedAt ?? t.createdAt)} · {t.status}
                        </div>
                      </div>
                      {t.invoiceNumber && (
                        <span className="text-xs text-muted-foreground">Fatura {t.invoiceNumber}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
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
