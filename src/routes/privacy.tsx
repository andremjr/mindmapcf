import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Canvas Narrativo" },
      { name: "description", content: "Como o Canvas Narrativo coleta, usa e protege seus dados." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Voltar</Link>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight">Política de Privacidade</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última atualização: 20 de julho de 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="text-lg font-semibold">1. Controlador de Dados</h2>
            <p>
              O controlador dos dados pessoais tratados no Canvas Narrativo é{" "}
              <strong>André Carlos Lima Marinho Junior</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. Dados que Coletamos</h2>
            <ul className="list-disc pl-6">
              <li><strong>Dados de conta:</strong> nome, e-mail, credenciais de autenticação;</li>
              <li><strong>Conteúdo do usuário:</strong> mapas mentais, textos, imagens e vídeos que você adiciona;</li>
              <li><strong>Dados de uso:</strong> logs de acesso, endereço IP, tipo de dispositivo, navegador;</li>
              <li><strong>Dados de suporte:</strong> mensagens enviadas ao atendimento;</li>
              <li><strong>Dados de pagamento:</strong> processados diretamente pela Kiwify. Recebemos apenas o
                status da assinatura e identificadores necessários (ID de assinatura e e-mail do comprador).</li>

            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Finalidades e Bases Legais</h2>
            <ul className="list-disc pl-6">
              <li>Criar e manter sua conta — execução do contrato;</li>
              <li>Fornecer o Serviço e armazenar seu conteúdo — execução do contrato;</li>
              <li>Cobrança de assinaturas via Kiwify — execução do contrato e obrigação legal;</li>
              <li>Segurança, prevenção a fraudes e cumprimento de obrigações legais — legítimo interesse e obrigação legal;</li>
              <li>Melhoria do produto e suporte ao cliente — legítimo interesse;</li>
              <li>Comunicações transacionais — execução do contrato.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Compartilhamento com Terceiros</h2>
            <p>Compartilhamos dados estritamente necessários com:</p>
            <ul className="list-disc pl-6">
              <li><strong>Kiwify</strong> — processadora de pagamentos, gerencia assinaturas, cobrança recorrente e emite recibos;</li>
              <li><strong>Supabase</strong> — hospedagem, banco de dados e armazenamento de arquivos;</li>
              <li><strong>Provedores de infraestrutura</strong> — CDN e computação em nuvem;</li>
              <li><strong>Autoridades públicas</strong> — quando exigido por lei.</li>
            </ul>
            <p>Não vendemos seus dados pessoais.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Transferências Internacionais</h2>
            <p>
              Nossos provedores podem processar dados fora do Brasil, incluindo Estados Unidos e União Europeia.
              Adotamos salvaguardas contratuais adequadas para essas transferências.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Retenção</h2>
            <p>
              Mantemos os dados enquanto sua conta estiver ativa e pelo período necessário para cumprir
              obrigações legais, fiscais e contábeis. Após esse período, os dados são excluídos ou anonimizados.
              Você pode solicitar a exclusão da conta a qualquer momento.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Seus Direitos (LGPD/GDPR)</h2>
            <p>Você tem direito a:</p>
            <ul className="list-disc pl-6">
              <li>Confirmar a existência de tratamento e acessar seus dados;</li>
              <li>Corrigir dados incompletos ou desatualizados;</li>
              <li>Solicitar anonimização, bloqueio ou eliminação de dados desnecessários;</li>
              <li>Portabilidade dos dados;</li>
              <li>Revogar consentimento;</li>
              <li>Apresentar reclamação à autoridade de proteção de dados competente (ANPD no Brasil).</li>
            </ul>
            <p>Para exercer esses direitos, use os canais de suporte do Serviço.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Segurança</h2>
            <p>
              Aplicamos medidas técnicas e organizacionais adequadas — criptografia em trânsito, controles de
              acesso, isolamento por usuário via RLS — para proteger seus dados contra acesso não autorizado,
              perda ou alteração indevida.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. Cookies</h2>
            <p>
              Usamos cookies essenciais para autenticação e funcionamento do Serviço. Não utilizamos cookies
              de publicidade de terceiros. A Kiwify pode utilizar cookies próprios durante o checkout,
              conforme a política dela.
            </p>
          </section>


          <section>
            <h2 className="text-lg font-semibold">10. Contato</h2>
            <p>
              Para questões sobre esta política ou sobre seus dados pessoais, entre em contato pelos canais
              oficiais do Serviço. O controlador é André Carlos Lima Marinho Junior.
            </p>
          </section>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
