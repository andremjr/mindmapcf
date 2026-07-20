import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPaddleEnvironment } from "@/lib/paddle";

type SubscriptionRow = {
  status: string;
  current_period_end: string | null;
  price_id: string;
  environment: "sandbox" | "live";
};

function isActive(row: SubscriptionRow | null) {
  if (!row) return false;
  const activeStatus = ["active", "trialing", "past_due"].includes(row.status);
  const canceledWithAccess = row.status === "canceled" && !!row.current_period_end;
  const hasTime = !row.current_period_end || new Date(row.current_period_end).getTime() > Date.now();
  return (activeStatus || canceledWithAccess) && hasTime;
}

export function useSubscription(userId: string | undefined) {
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const environment = getPaddleEnvironment();

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!userId) {
        setSubscription(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("subscriptions")
        .select("status, current_period_end, price_id, environment")
        .eq("user_id", userId)
        .eq("environment", environment)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      if (error) console.error("[payments] subscription", error);
      setSubscription((data as SubscriptionRow | null) ?? null);
      setLoading(false);
    }
    load();

    if (!userId) return () => {
      alive = false;
    };

    const channel = supabase
      .channel(`subscription-${userId}-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [userId, environment]);

  return { subscription, loading, isPro: isActive(subscription), environment };
}