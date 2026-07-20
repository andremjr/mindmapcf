import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/refund")({
  head: () => ({
    meta: [
      { title: "Política de Reembolso — Canvas Narrativo" },
      { name: "description", content: "Política de reembolso e garantia de 30 dias do Canvas Narrativo." },
    ],
  }),
  component: RefundPage,
});

function RefundPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Voltar</Link>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight">Política de Reembolso</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última atualização: 20 de julho de 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="text-lg font-semibold">Garantia de 30 dias</h2>
            <p>
              Oferecemos uma <strong>garantia de reembolso de 30 dias</strong>. Se você não estiver satisfeito com
              o Canvas Narrativo, pode solicitar o reembolso total dentro de 30 dias a partir da data do pedido.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Como solicitar</h2>
            <p>
              Os reembolsos são processados pela <strong>Paddle</strong>, nosso Merchant of Record. Para
              solicitar, acesse{" "}
              <a href="https://paddle.net" className="text-primary underline" target="_blank" rel="noreferrer">
                paddle.net
              </a>{" "}
              usando o e-mail da compra, localize a transação e solicite o reembolso. Você também pode entrar em
              contato com o nosso suporte pelos canais oficiais do Serviço.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Cancelamento de assinatura</h2>
            <p>
              Você pode cancelar sua assinatura a qualquer momento na página{" "}
              <Link to="/account" className="text-primary underline">Minha conta</Link>. Ao cancelar, você
              continua com acesso Pro até o fim do período já pago e não é cobrado novamente.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Renovações</h2>
            <p>
              Assinaturas mensais, semestrais e anuais renovam automaticamente ao fim de cada ciclo, salvo
              cancelamento anterior. Pedidos de reembolso após 30 dias serão analisados caso a caso, conforme a
              política da Paddle:{" "}
              <a
                href="https://www.paddle.com/legal/refund-policy"
                className="text-primary underline"
                target="_blank"
                rel="noreferrer"
              >
                paddle.com/legal/refund-policy
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Contato</h2>
            <p>
              Serviço fornecido por <strong>André Carlos Lima Marinho Junior</strong>. Nosso processo de pedidos é
              conduzido pelo nosso revendedor online Paddle.com. Paddle.com é o Merchant of Record de todos os
              nossos pedidos.
            </p>
          </section>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
