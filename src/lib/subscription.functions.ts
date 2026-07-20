import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type PaddleEnv = "sandbox" | "live";

function assertEnv(env: unknown): PaddleEnv {
  if (env !== "sandbox" && env !== "live") throw new Error("Invalid environment");
  return env;
}

// Owner check: server functions must never trust a subscription id supplied
// by the client without verifying it belongs to the authenticated user.
async function assertOwnsSubscription(
  supabase: any,
  userId: string,
  subscriptionId: string,
  env: PaddleEnv,
) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("paddle_subscription_id, paddle_customer_id, user_id, environment")
    .eq("paddle_subscription_id", subscriptionId)
    .eq("environment", env)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.user_id !== userId) throw new Error("Not authorized");
  return data as { paddle_customer_id: string };
}

async function paddleRequest(env: PaddleEnv, path: string, init?: RequestInit) {
  const { gatewayFetch } = await import("@/lib/paddle.server");
  const res = await gatewayFetch(env, path, init);
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = json?.error?.detail ?? json?.error?.code ?? res.statusText;
    throw new Error(`Paddle: ${detail}`);
  }
  return json;
}

// ---------- Read: sub detail from Paddle (for period end, scheduled change, items) ----------
export const getSubscriptionDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { subscriptionId: string; environment: PaddleEnv }) => {
    assertEnv(data.environment);
    if (!data.subscriptionId) throw new Error("Missing subscriptionId");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertOwnsSubscription(context.supabase, context.userId, data.subscriptionId, data.environment);
    const result = await paddleRequest(data.environment, `/subscriptions/${data.subscriptionId}`);
    const d = result.data;
    return {
      id: d.id as string,
      status: d.status as string,
      currentBillingPeriod: d.current_billing_period ?? null,
      nextBilledAt: d.next_billed_at ?? null,
      canceledAt: d.canceled_at ?? null,
      scheduledChange: d.scheduled_change ?? null,
      items: (d.items ?? []).map((it: any) => ({
        priceId: it.price?.id,
        externalPriceId: it.price?.import_meta?.external_id,
        productExternalId: it.price?.product?.import_meta?.external_id,
        unitAmount: it.price?.unit_price?.amount,
        currency: it.price?.unit_price?.currency_code,
        interval: it.price?.billing_cycle?.interval,
        frequency: it.price?.billing_cycle?.frequency,
      })),
    };
  });

// ---------- Cancel at period end ----------
export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { subscriptionId: string; environment: PaddleEnv }) => {
    assertEnv(data.environment);
    if (!data.subscriptionId) throw new Error("Missing subscriptionId");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertOwnsSubscription(context.supabase, context.userId, data.subscriptionId, data.environment);
    await paddleRequest(data.environment, `/subscriptions/${data.subscriptionId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ effective_from: "next_billing_period" }),
    });
    return { ok: true };
  });

// ---------- Resume (undo scheduled cancellation) ----------
export const resumeSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { subscriptionId: string; environment: PaddleEnv }) => {
    assertEnv(data.environment);
    if (!data.subscriptionId) throw new Error("Missing subscriptionId");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertOwnsSubscription(context.supabase, context.userId, data.subscriptionId, data.environment);
    await paddleRequest(data.environment, `/subscriptions/${data.subscriptionId}`, {
      method: "PATCH",
      body: JSON.stringify({ scheduled_change: null }),
    });
    return { ok: true };
  });

// ---------- Change plan (prorated_immediately) ----------
export const changeSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { subscriptionId: string; newPriceExternalId: string; environment: PaddleEnv }) => {
      assertEnv(data.environment);
      if (!data.subscriptionId) throw new Error("Missing subscriptionId");
      if (!data.newPriceExternalId) throw new Error("Missing newPriceExternalId");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    await assertOwnsSubscription(context.supabase, context.userId, data.subscriptionId, data.environment);
    // Resolve external_id → Paddle price id
    const lookup = await paddleRequest(
      data.environment,
      `/prices?external_id=${encodeURIComponent(data.newPriceExternalId)}`,
    );
    const newPriceId = lookup?.data?.[0]?.id;
    if (!newPriceId) throw new Error("Preço não encontrado");
    await paddleRequest(data.environment, `/subscriptions/${data.subscriptionId}`, {
      method: "PATCH",
      body: JSON.stringify({
        items: [{ price_id: newPriceId, quantity: 1 }],
        proration_billing_mode: "prorated_immediately",
      }),
    });
    return { ok: true };
  });

// ---------- Update payment method: creates a checkout transaction ----------
export const getUpdatePaymentTxn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { subscriptionId: string; environment: PaddleEnv }) => {
    assertEnv(data.environment);
    if (!data.subscriptionId) throw new Error("Missing subscriptionId");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertOwnsSubscription(context.supabase, context.userId, data.subscriptionId, data.environment);
    const result = await paddleRequest(
      data.environment,
      `/subscriptions/${data.subscriptionId}/update-payment-method-transaction`,
    );
    return { transactionId: result.data.id as string };
  });

// ---------- List recent transactions ----------
export const listMyTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { environment: PaddleEnv }) => {
    assertEnv(data.environment);
    return data;
  })
  .handler(async ({ data, context }) => {
    // Find the customer id from any of the user's subscriptions in this env
    const { data: sub, error } = await context.supabase
      .from("subscriptions")
      .select("paddle_customer_id")
      .eq("user_id", context.userId)
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!sub?.paddle_customer_id || sub.paddle_customer_id.startsWith("manual_")) {
      return { transactions: [] as Array<any> };
    }
    const result = await paddleRequest(
      data.environment,
      `/transactions?customer_id=${encodeURIComponent(sub.paddle_customer_id)}&per_page=20&order_by=created_at[DESC]`,
    );
    const transactions = (result.data ?? []).map((t: any) => ({
      id: t.id as string,
      status: t.status as string,
      currency: t.currency_code as string,
      total: t.details?.totals?.total as string,
      createdAt: t.created_at as string,
      billedAt: t.billed_at as string | null,
      invoiceNumber: t.invoice_number as string | null,
    }));
    return { transactions };
  });
