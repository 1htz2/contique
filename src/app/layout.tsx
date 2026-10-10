import type { Metadata, Viewport } from "next";
import { Fraunces, Nunito } from "next/font/google";
import { AttributionCapture } from "@/components/attribution-capture";
import { Footer } from "@/components/ui";
import { Pixels } from "@/components/pixels";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600"],
});

const body = Nunito({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

const title = "Crie uma história onde a criança é a protagonista";
const description =
  "Envie uma foto, escolha uma aventura e receba um livro personalizado criado especialmente para uma criança que você ama.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${title} | ${SITE_NAME}`, template: `%s | ${SITE_NAME}` },
  description,
  applicationName: SITE_NAME,
  openGraph: { title, description, siteName: SITE_NAME, locale: "pt_BR", type: "website", url: "/" },
  twitter: { card: "summary_large_image", title, description },
};

export const viewport: Viewport = {
  themeColor: "#fbf6ec",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col">
        {children}
        <Footer />
        <AttributionCapture />
        <Pixels />
      </body>
    </html>
  );
}
