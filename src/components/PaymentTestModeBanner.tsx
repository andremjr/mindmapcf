import { getPaddleEnvironment } from "@/lib/paddle";
import { useEffect, useState } from "react";

export function PaymentTestModeBanner() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  if (getPaddleEnvironment() !== "sandbox") return null;

  return (
    <div className="w-full border-b border-border bg-muted px-4 py-2 text-center text-xs text-muted-foreground">
      Pagamentos do preview estão em modo de teste; nenhuma cobrança real será feita.
    </div>
  );
}