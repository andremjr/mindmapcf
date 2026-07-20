import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/refund")({
  head: () => ({
    meta: [
      { title: "Política de Reembolso — Canvas Narrativo" },
      { name: "description", content: "Política de reembolso e garantia de 7 dias do Canvas Narrativo." },
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
            <h2 className="text-lg font-semibold">Garantia de 7 dias (arrependimento)</h2>
            <p>
              Conforme o <strong>Art. 49 do Código de Defesa do Consumidor</strong>, você tem até{" "}
              <strong>7 dias corridos</strong> a contar da assinatura do plano para solicitar o cancelamento
              com <strong>reembolso integral</strong>, sem necessidade de justificativa.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Como solicitar</h2>
            <p>
              Envie a solicitação para o nosso suporte, informando o e-mail usado na compra e o ID do pedido
              recebido no e-mail de confirmação da Kiwify. O reembolso é processado pela <strong>Kiwify</strong>
              (nosso processador de pagamentos) e devolvido pelo mesmo meio de pagamento utilizado:
            </p>
            <ul className="list-disc pl-6">
              <li><strong>Cartão de crédito:</strong> estorno em 1 a 2 faturas, conforme o banco emissor;</li>
              <li><strong>Pix:</strong> devolução em até 7 dias úteis;</li>
              <li><strong>Boleto:</strong> devolução em até 7 dias úteis via Pix ou TED.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Cancelamento de assinatura</h2>
            <p>
              Você pode cancelar sua assinatura a qualquer momento na página{" "}
              <Link to="/account" className="text-primary underline">Minha conta</Link>. Ao cancelar, você
              continua com acesso Pro até o fim do período já pago e não é cobrado novamente. O cancelamento
              após o prazo de 7 dias não gera reembolso proporcional do ciclo em curso.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Renovações</h2>
            <p>
              Assinaturas mensais, semestrais e anuais renovam automaticamente ao fim de cada ciclo, salvo
              cancelamento anterior. Pedidos de reembolso fora da janela de 7 dias serão analisados caso a
              caso — em situações excepcionais (falha comprovada do serviço, cobrança indevida) o reembolso
              pode ser concedido.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Contato</h2>
            <p>
              Serviço fornecido por <strong>André Carlos Lima Marinho Junior</strong>. Pagamentos processados
              pela Kiwify. Para dúvidas sobre reembolso, entre em contato pelos canais oficiais do Serviço.
            </p>
          </section>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
