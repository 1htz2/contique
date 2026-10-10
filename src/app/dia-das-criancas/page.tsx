import type { Metadata } from "next";
import { Landing } from "@/components/landing";
import { env } from "@/lib/server/env";

export const metadata: Metadata = {
  title: "Especial Dia das Crianças",
  description: "Ainda procurando um presente especial? Crie uma história personalizada em poucos minutos.",
};

export default function DiaDasCriancas() {
  return <Landing price={env().BOOK_PRICE_BRL} seasonal />;
}
