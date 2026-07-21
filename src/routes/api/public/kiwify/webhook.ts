import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Kiwify webhook handler.
 * Signature: HMAC-SHA1(body, KIWIFY_WEBHOOK_TOKEN), sent as ?signature=<hex>.
 * Configure this URL in Kiwify → Configurações → Webhooks for each product.
 */

type PlanId = "pro_monthly" | "pro_semiannual" | "pro_annual";

function detectPlan(productName: string | undefined | null): PlanId | null {
  const name = (productName ?? "").toLowerCase();
  if (name.includes("mensal")) return "pro_monthly";
  if (name.includes("semestral")) return "pro_semiannual";
  if (name.includes("anual")) return "pro_annual";
  return null;
}

function addDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function planPeriodEnd(plan: PlanId, startIso?: string | null): string {
  const start = startIso ? new Date(startIso) : new Date();
  const days = plan === "pro_monthly" ? 31 : plan === "pro_semiannual" ? 186 : 372;
  return addDays(start, days);
}

function parseKiwifyDate(v: unknown): string | null {
  if (!v || typeof v !== "string") return null;
  // Kiwify sometimes sends "YYYY-MM-DD HH:mm:ss" — convert to ISO.
  const iso = v.includes("T") ? v : v.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function verifySignature(rawBody: string, signature: string, token: string): boolean {
  const expected = createHmac("sha1", token).update(rawBody).digest("hex");
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function findUserId(supabaseAdmin: any, email: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc("get_user_id_by_email", { _email: email });
  if (error) {
    console.error("[kiwify] user lookup", error);
    return null;
  }
  return (data as string | null) ?? null;
}

async function upsertRow(supabaseAdmin: any, row: Record<string, unknown>, subscriptionId: string) {
  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "paddle_subscription_id" });
  if (error) {
    console.error("[kiwify] upsert", error, "subId:", subscriptionId);
    throw error;
  }
}

async function updateStatus(
  supabaseAdmin: any,
  subscriptionId: string,
  status: string,
  patch: Record<string, unknown> = {},
) {
  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({ status, ...patch, updated_at: new Date().toISOString() })
    .eq("paddle_subscription_id", subscriptionId);
  if (error) {
    console.error("[kiwify] update", error);
    throw error;
  }
}

export const Route = createFileRoute("/api/public/kiwify/webhook")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const token = process.env.KIWIFY_WEBHOOK_TOKEN;
        if (!token) {
          console.error("[kiwify] missing KIWIFY_WEBHOOK_TOKEN");
          return new Response("Server not configured", { status: 500 });
        }

        const url = new URL(request.url);
        const signature = url.searchParams.get("signature") ?? "";
        const rawBody = await request.text();

        if (!signature || !verifySignature(rawBody, signature, token)) {
          console.warn("[kiwify] invalid signature");
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: any;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const event: string = payload.webhook_event_type ?? payload.event ?? "";
        const email: string | undefined = payload.Customer?.email ?? payload.customer?.email;
        const productName: string | undefined = payload.Product?.product_name ?? payload.product?.name;
        const productId: string | undefined = payload.Product?.product_id ?? payload.product?.id ?? payload.product_id;
        const orderId: string = payload.order_id ?? payload.id ?? "";
        const subscriptionId: string =
          payload.Subscription?.id ?? payload.subscription_id ?? payload.subscription?.id ?? orderId;
        const nextPayment = parseKiwifyDate(payload.Subscription?.next_payment);
        const startDate = parseKiwifyDate(payload.Subscription?.start_date) ?? new Date().toISOString();

        if (!email || !subscriptionId) {
          console.warn("[kiwify] missing email/subscriptionId", { event, orderId });
          return Response.json({ received: true, skipped: true });
        }

        const plan = detectPlan(productName);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        try {
          if (
            event === "order_approved" ||
            event === "pedido_aprovado" ||
            event === "subscription_renewed" ||
            event === "assinatura_renovada"
          ) {
            if (!plan) {
              console.warn("[kiwify] unknown plan", productName);
              return Response.json({ received: true, skipped: "unknown-plan" });
            }
            const userId = await findUserId(supabaseAdmin, email);
            if (!userId) {
              console.warn("[kiwify] no user for email", email, "— they must sign up with this email");
              return Response.json({ received: true, skipped: "no-user" });
            }
            await upsertRow(
              supabaseAdmin,
              {
                user_id: userId,
                paddle_subscription_id: subscriptionId,
                paddle_customer_id: email,
                product_id: productId ?? plan,
                price_id: plan,
                status: "active",
                current_period_start: startDate,
                current_period_end: nextPayment ?? planPeriodEnd(plan, startDate),
                cancel_at_period_end: false,
                environment: "live",
              },
              subscriptionId,
            );
          } else if (event === "subscription_canceled" || event === "assinatura_cancelada") {
            // Cancel at period end — keep access until current_period_end
            await updateStatus(supabaseAdmin, subscriptionId, "canceled", {
              cancel_at_period_end: true,
            });
          } else if (event === "subscription_late" || event === "assinatura_atrasada") {
            await updateStatus(supabaseAdmin, subscriptionId, "past_due");
          } else if (
            event === "order_refunded" ||
            event === "pedido_reembolsado" ||
            event === "chargeback" ||
            event === "chargedback"
          ) {
            // Immediate cutoff
            await updateStatus(supabaseAdmin, subscriptionId, "canceled", {
              current_period_end: new Date().toISOString(),
            });
          } else {
            console.log("[kiwify] event ignored:", event);
          }
        } catch (err) {
          console.error("[kiwify] handler error", err);
          return new Response("Handler error", { status: 500 });
        }

        return Response.json({ received: true });
      },
    },
  },
});
