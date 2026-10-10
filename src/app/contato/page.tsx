import type { Metadata } from "next";
import { LegalPage } from "@/components/ui";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Contato" };

export default function ContactPage() {
  return (
    <LegalPage title="Contato" updated="10/10/2026">
      <section>
        <p>
          Dúvidas, problemas com o livro ou pedidos sobre seus dados: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
        <p>Se for sobre um livro, mande o link da página dele. Respondemos em até um dia útil.</p>
      </section>
    </LegalPage>
  );
}
