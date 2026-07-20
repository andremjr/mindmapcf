/**
 * Kiwify checkout URLs — one per plan.
 * Each URL is generated in the Kiwify dashboard for a specific product/price.
 */
export const KIWIFY_CHECKOUT_URLS = {
  pro_monthly: "https://pay.kiwify.com.br/4kkq6EO",
  pro_semiannual: "https://pay.kiwify.com.br/nx99Uft",
  pro_annual: "https://pay.kiwify.com.br/MlIu56K",
} as const;

export type KiwifyPlanId = keyof typeof KIWIFY_CHECKOUT_URLS;

/** Build the checkout URL with prefilled email (for reliable user matching in the webhook). */
export function buildKiwifyCheckoutUrl(plan: KiwifyPlanId, email?: string | null): string {
  const base = KIWIFY_CHECKOUT_URLS[plan];
  if (!email) return base;
  const url = new URL(base);
  url.searchParams.set("email", email);
  return url.toString();
}

/** Kiwify customer area — where users manage/cancel their subscription. */
export const KIWIFY_CUSTOMER_PORTAL = "https://dashboard.kiwify.com.br/dashboard";
