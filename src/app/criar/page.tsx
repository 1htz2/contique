import type { Metadata } from "next";
import { THEME_IDS, type ThemeId } from "@/lib/domain/themes";
import { Wizard } from "./wizard";

export const metadata: Metadata = { title: "Criar minha história", robots: { index: false } };

export default async function CreatePage({ searchParams }: PageProps<"/criar">) {
  const query = await searchParams;
  const theme = typeof query.tema === "string" && (THEME_IDS as string[]).includes(query.tema) ? (query.tema as ThemeId) : undefined;
  const photoOnly = query.etapa === "foto";
  return <Wizard initialTheme={theme} startAtPhoto={photoOnly} />;
}
