import { createFileRoute } from "@tanstack/react-router";

type PaddleEnv = "sandbox" | "live";

function safeEnv(value: string | null): PaddleEnv {
  return value === "live" ? "live" : "sandbox";
}

async function upsertSubscription(data: any, env: PaddleEnv) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const userId = data.customData?.userId;
  if (!userId) {
    console.error("[payments] subscription without userId");
    return;
  }

  const item = data.items?.[0];
  const priceId = item?.price?.importMeta?.externalId;
  const productId = item?.product?.importMeta?.externalId;
  if (!priceId || !productId) {
    console.warn("[payments] missing external ids", {
      rawPriceId: item?.price?.id,
      rawProductId: item?.product?.id,
    });
    return;
  }

  const { error } = await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: userId,
      paddle_subscription_id: data.id,
      paddle_customer_id: data.customerId,
      product_id: productId,
      price_id: priceId,
      status: data.status,
      current_period_start: data.currentBillingPeriod?.startsAt ?? null,
      current_period_end: data.currentBillingPeriod?.endsAt ?? null,
      cancel_at_period_end: data.scheduledChange?.action === "cancel",
      environment: env,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "paddle_subscription_id" },
  );
  if (error) throw error;
}

async function updateSubscription(data: any, env: PaddleEnv, status?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({
      status: status ?? data.status,
      current_period_start: data.currentBillingPeriod?.startsAt ?? null,
      current_period_end: data.currentBillingPeriod?.endsAt ?? null,
      cancel_at_period_end: data.scheduledChange?.action === "cancel",
      updated_at: new Date().toISOString(),
    })
    .eq("paddle_subscription_id", data.id)
    .eq("environment", env);
  if (error) throw error;
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const env = safeEnv(url.searchParams.get("env"));
        try {
          const { verifyWebhook } = await import("@/lib/paddle.server");
          const event = await verifyWebhook(request, env);

          if (event.eventType === "subscription.created") {
            await upsertSubscription(event.data, env);
          } else if (event.eventType === "subscription.updated") {
            await updateSubscription(event.data, env);
          } else if (event.eventType === "subscription.canceled") {
            await updateSubscription(event.data, env, "canceled");
          }

          return Response.json({ received: true });
        } catch (error) {
          console.error("[payments] webhook", error);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});