import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — Canvas Narrativo" },
      { name: "description", content: "Termos e condições de uso do Canvas Narrativo." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Voltar</Link>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight">Termos de Uso</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última atualização: 20 de julho de 2026</p>

        <div className="prose prose-invert mt-8 max-w-none space-y-6 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="text-lg font-semibold">1. Identificação do Prestador</h2>
            <p>
              O Canvas Narrativo (“Serviço”) é fornecido por <strong>André Carlos Lima Marinho Junior</strong>
              (“nós”, “nosso”). Ao usar o Serviço, você celebra um contrato com o prestador identificado acima.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. Aceitação dos Termos</h2>
            <p>
              Ao criar uma conta ou continuar utilizando o Serviço, você concorda com estes Termos.
              Se você não concorda, não deve usar o Serviço.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Descrição do Serviço</h2>
            <p>
              O Canvas Narrativo é uma ferramenta web para criação de mapas mentais com suporte a imagens, vídeos,
              modo apresentação com câmera cinematográfica e gravação em MP4.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Conta e Credenciais</h2>
            <p>
              Você deve fornecer informações precisas ao criar sua conta e manter a confidencialidade das
              credenciais. Você é responsável por toda atividade realizada com sua conta.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Uso Aceitável</h2>
            <p>Você concorda em não usar o Serviço para:</p>
            <ul className="list-disc pl-6">
              <li>Atividades ilegais, fraude ou spam;</li>
              <li>Violar direitos de propriedade intelectual de terceiros;</li>
              <li>Interferir na segurança do Serviço (malware, engenharia reversa, scraping automatizado);</li>
              <li>Redistribuir, revender ou contornar limitações técnicas do Serviço.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Propriedade Intelectual</h2>
            <p>
              Todos os direitos sobre o software, marca, interface e documentação do Canvas Narrativo permanecem
              com o prestador. Concedemos a você uma licença limitada, não exclusiva e intransferível de uso
              conforme seu plano ativo.
            </p>
            <p>
              O conteúdo que você cria (mapas mentais, textos, imagens, vídeos) permanece seu. Você nos concede
              uma licença limitada para hospedar e processar esse conteúdo apenas para prestar o Serviço.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Pagamentos, Assinaturas e Reembolsos</h2>
            <p>
              Nosso processo de pedidos é conduzido pelo nosso revendedor online <strong>Paddle.com</strong>.
              Paddle.com é o Merchant of Record de todos os nossos pedidos. A Paddle fornece todo o atendimento ao
              cliente e gerencia reembolsos.
            </p>
            <p>
              Termos de pagamento, cobrança recorrente, impostos, cancelamento e reembolso são regidos pelos
              Termos de Comprador da Paddle:{" "}
              <a
                href="https://www.paddle.com/legal/checkout-buyer-terms"
                className="text-primary underline"
                target="_blank"
                rel="noreferrer"
              >
                paddle.com/legal/checkout-buyer-terms
              </a>
              . Consulte também nossa{" "}
              <Link to="/refund" className="text-primary underline">Política de Reembolso</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Nível de Serviço</h2>
            <p>
              Nos esforçamos para manter o Serviço disponível, mas não garantimos operação ininterrupta ou livre
              de erros. Podemos realizar manutenção, atualizações ou modificações a qualquer momento.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. Suspensão e Encerramento</h2>
            <p>
              Podemos suspender ou encerrar seu acesso em caso de: violação material destes Termos, inadimplência,
              risco de fraude ou segurança, ou violações repetidas de políticas. Após o encerramento, você poderá
              exportar seus mapas por um período razoável antes da exclusão.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">10. Isenção de Garantias e Limitação de Responsabilidade</h2>
            <p>
              O Serviço é fornecido “no estado em que se encontra”. Na máxima medida permitida por lei, isentamo-nos
              de garantias implícitas de comerciabilidade e adequação a um fim específico. Nossa responsabilidade
              agregada é limitada aos valores efetivamente pagos por você nos 12 meses anteriores ao evento.
              Não somos responsáveis por danos indiretos, consequenciais, lucros cessantes ou perda de dados.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">11. Indenização</h2>
            <p>
              Você concorda em indenizar o prestador contra reclamações decorrentes do seu conteúdo, do uso
              indevido do Serviço ou da violação destes Termos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">12. Lei Aplicável</h2>
            <p>
              Estes Termos são regidos pelas leis do Brasil. Fica eleito o foro do domicílio do prestador para
              dirimir controvérsias, salvo direito indisponível do consumidor.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">13. Alterações</h2>
            <p>
              Podemos atualizar estes Termos periodicamente. Alterações relevantes serão comunicadas pelo Serviço
              ou por e-mail. O uso contínuo após a alteração implica aceitação.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">14. Contato</h2>
            <p>Para dúvidas sobre estes Termos, entre em contato pelos canais oficiais do Serviço.</p>
          </section>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
