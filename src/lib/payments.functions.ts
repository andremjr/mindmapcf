import { createServerFn } from "@tanstack/react-start";

type PaddleEnv = "sandbox" | "live";

export const resolvePaddlePrice = createServerFn({ method: "GET" })
  .inputValidator((data: { priceId: string; environment: PaddleEnv }) => {
    if (!data?.priceId) throw new Error("Missing price id");
    if (data.environment !== "sandbox" && data.environment !== "live") {
      throw new Error("Invalid payment environment");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const { gatewayFetch } = await import("@/lib/paddle.server");
    const response = await gatewayFetch(
      data.environment,
      `/prices?external_id=${encodeURIComponent(data.priceId)}`,
    );
    const result = await response.json();
    if (!response.ok || !result.data?.length) throw new Error("Price not found");
    return result.data[0].id as string;
  });