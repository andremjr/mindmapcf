import { useState } from "react";
import { getPaddlePriceId, initializePaddle } from "@/lib/paddle";

export function usePaddleCheckout() {
  const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null);

  async function openCheckout(options: {
    priceId: string;
    customerEmail?: string;
    customData?: Record<string, string>;
    successUrl?: string;
  }) {
    setLoadingPriceId(options.priceId);
    try {
      await initializePaddle();
      const paddlePriceId = await getPaddlePriceId(options.priceId);
      window.Paddle.Checkout.open({
        items: [{ priceId: paddlePriceId, quantity: 1 }],
        customer: options.customerEmail ? { email: options.customerEmail } : undefined,
        customData: options.customData,
        settings: {
          displayMode: "overlay",
          successUrl: options.successUrl || `${window.location.origin}/checkout/success`,
          allowLogout: false,
          variant: "one-page",
        },
      });
    } finally {
      setLoadingPriceId(null);
    }
  }

  return { openCheckout, loadingPriceId };
}