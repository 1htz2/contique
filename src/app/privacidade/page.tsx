import type { Metadata } from "next";
import { LegalPage } from "@/components/ui";
import { env } from "@/lib/server/env";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = { title: "Política de privacidade" };

export default function PrivacyPage() {
  const retention = env().BOOK_RETENTION_DAYS;
  return (
    <LegalPage title="Política de privacidade" updated="10/10/2026">
      <section>
        <p>
          O {SITE_NAME} cria livros infantis personalizados a partir de uma foto e de algumas informações sobre a criança. Fotos de crianças
          pedem cuidado máximo, então coletamos o mínimo possível e apagamos o quanto antes.
        </p>
      </section>
      <section>
        <h2>O que coletamos</h2>
        <ul>
          <li>Primeiro nome, apelido (opcional) e idade da criança.</li>
          <li>Como a história deve se referir à criança (ele, ela ou só pelo nome).</li>
          <li>Aventura escolhida, gostos e características que você informar, e o nome de um acompanhante (irmão, amigo ou pet), se quiser.</li>
          <li>Uma foto da criança.</li>
          <li>Dados técnicos da visita: endereço IP, navegador, origem do anúncio (UTMs) e um identificador anônimo do aparelho.</li>
        </ul>
        <p>Não pedimos sobrenome, endereço, escola, localização nem documento. Não é preciso criar conta.</p>
      </section>
      <section>
        <h2>Para que usamos a foto</h2>
        <p>
          A foto serve só como referência visual para desenhar a personagem: cor e formato do cabelo, traços gerais do rosto, tom de pele como cor
          de pintura e acessórios visíveis. Não inferimos nem registramos raça, etnia, saúde, religião, personalidade ou identidade. O resultado é
          sempre uma ilustração, nunca uma cópia fotográfica.
        </p>
        <p>
          A foto fica em armazenamento privado, nunca é pública e é excluída automaticamente assim que a capa fica pronta, normalmente em cerca de
          um minuto. Se algo falhar no meio do caminho, uma rotina automática apaga qualquer foto com mais de 24 horas. Ao reenviar os dados, removemos
          os metadados da imagem, como a localização GPS.
        </p>
        <p>O {SITE_NAME} não usa fotos nem livros para treinar modelos de inteligência artificial e não tem galeria pública.</p>
      </section>
      <section>
        <h2>Fornecedores de tecnologia</h2>
        <ul>
          <li><strong>Anthropic</strong> (Claude): lê a foto para descrever a personagem e escreve a história.</li>
          <li><strong>Google</strong> (Gemini) ou <strong>OpenAI</strong>: desenha a capa e as ilustrações a partir da descrição e, para a capa, da foto.</li>
          <li><strong>Supabase</strong>: banco de dados e armazenamento privado dos arquivos.</li>
          <li><strong>Vercel</strong>: hospedagem do site.</li>
          <li><strong>Mercado Pago</strong>: processamento do pagamento. Não recebemos nem guardamos dados do seu cartão.</li>
          <li><strong>Meta</strong> (e, se ativado, TikTok e Google Analytics): medição de anúncios, sem a foto nem os dados da criança.</li>
        </ul>
        <p>
          Usamos as APIs pagas desses fornecedores. Os termos comerciais delas dizem que os dados enviados não são usados para treinar os modelos
          e que podem ser retidos por um período limitado para segurança e prevenção de abuso. Cada fornecedor tem sua própria política, que
          prevalece sobre o que eles fazem com os dados.
        </p>
      </section>
      <section>
        <h2>Por quanto tempo guardamos</h2>
        <ul>
          <li>Foto original: até a capa ficar pronta; no máximo 24 horas.</li>
          <li>Ilustrações e PDFs de livros pagos: {retention} dias após a conclusão, para você baixar de novo.</li>
          <li>Prévias que não foram compradas: 7 dias.</li>
          <li>Registros de pagamento: pelo prazo exigido pela legislação fiscal. Eles não contêm a foto nem a história.</li>
        </ul>
      </section>
      <section>
        <h2>Pagamentos</h2>
        <p>
          O pagamento é feito pelo Mercado Pago, por Pix ou cartão. Guardamos o valor, a situação e a data do pagamento, ligados ao livro, para
          liberar o PDF e para obrigações fiscais.
        </p>
      </section>
      <section>
        <h2>Seus direitos</h2>
        <p>
          Pela LGPD, você pode pedir acesso, correção ou exclusão dos dados. Na página do livro há o botão “Excluir o livro e os dados agora”, que
          apaga na hora as ilustrações, o PDF, a história e os dados da criança. Para qualquer outro pedido, escreva para{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
        <p>Quem envia a foto declara ser responsável pela criança ou ter autorização do responsável.</p>
      </section>
    </LegalPage>
  );
}
