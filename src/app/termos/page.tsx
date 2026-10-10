import type { Metadata } from "next";
import { LegalPage } from "@/components/ui";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = { title: "Termos de uso" };

export default function TermsPage() {
  return (
    <LegalPage title="Termos de uso" updated="10/10/2026">
      <section>
        <h2>O produto</h2>
        <p>
          O {SITE_NAME} cria um livro infantil digital, em PDF, com uma história e ilustrações personalizadas. Você vê a capa e o começo da
          história antes de pagar. O pagamento é único, sem assinatura.
        </p>
      </section>
      <section>
        <h2>Foto e autorização</h2>
        <p>
          Ao enviar uma foto, você declara ser responsável pela criança ou ter autorização do responsável. Não envie fotos de outras pessoas
          sem autorização, nem imagens impróprias. Recusamos fotos sem rosto visível, com várias pessoas ou inadequadas.
        </p>
      </section>
      <section>
        <h2>Ilustrações</h2>
        <p>
          As ilustrações são criadas com inteligência artificial a partir de uma descrição da criança. Elas buscam lembrar a criança como
          personagem, mas não são retratos fiéis, e cada livro é único. O conteúdo é sempre infantil, positivo e sem violência.
        </p>
      </section>
      <section>
        <h2>Entrega e problemas</h2>
        <p>
          O PDF fica disponível na página do livro logo após a criação. Se alguma coisa der errado na geração, você não paga de novo: refazemos
          o que faltar. Se o livro não puder ser entregue, devolvemos o valor. Fale com a gente em{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </section>
      <section>
        <h2>Uso pessoal</h2>
        <p>O livro é para uso pessoal e familiar: guardar, imprimir, compartilhar com quem você quiser. A revenda não é permitida.</p>
      </section>
    </LegalPage>
  );
}
