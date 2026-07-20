import { resolvePaddlePrice } from "@/lib/payments.functions";

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN;

declare global {
  interface Window {
    Paddle?: any;
  }
}

export function getPaddleEnvironment(): "sandbox" | "live" {
  return clientToken?.startsWith("test_") ? "sandbox" : "live";
}

let paddleInitialized = false;

export async function initializePaddle() {
  if (paddleInitialized) return;
  if (!clientToken) throw new Error("Pagamentos ainda não estão disponíveis neste ambiente.");

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-paddle-js]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      if (window.Paddle) resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.dataset.paddleJs = "true";
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });

  const paddleJsEnvironment = getPaddleEnvironment() === "sandbox" ? "sandbox" : "production";
  window.Paddle.Environment.set(paddleJsEnvironment);
  window.Paddle.Initialize({ token: clientToken });
  paddleInitialized = true;
}

export async function getPaddlePriceId(priceId: string): Promise<string> {
  return resolvePaddlePrice({ data: { priceId, environment: getPaddleEnvironment() } });
}