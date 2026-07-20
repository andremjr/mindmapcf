import { Link } from "@tanstack/react-router";
import { Network } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Network className="size-4 text-primary" /> Canvas Narrativo
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            © {new Date().getFullYear()} André Carlos Lima Marinho Junior. Todos os direitos reservados.
          </p>
        </div>
        <nav className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <Link to="/pricing" className="hover:text-foreground">Planos</Link>
          <Link to="/terms" className="hover:text-foreground">Termos</Link>
          <Link to="/privacy" className="hover:text-foreground">Privacidade</Link>
          <Link to="/refund" className="hover:text-foreground">Reembolso</Link>
        </nav>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-3 text-xs text-muted-foreground">
          Pagamentos processados de forma segura pela <strong>Kiwify</strong> (cartão, Pix e boleto).
        </div>
      </div>
    </footer>
  );
}
