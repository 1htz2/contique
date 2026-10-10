export const SITE_NAME = "Contique";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://contique.com.br").replace(/\/$/, "");
export const SITE_DOMAIN = new URL(SITE_URL).host;
// Fixed on purpose: Mercado Pago rejects payer emails on hosts like localhost or vercel.app.
export const PAYER_EMAIL_DOMAIN = "contique.com.br";
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "contato@contique.com.br";
export const PRODUCT_NAMES = { book: "Livro personalizado", coloring: "Livro para colorir" } as const;

export const brl = (value: number) => `R$ ${value.toFixed(2).replace(".", ",")}`;

export const PHOTO_PROMISE =
  "A foto será utilizada somente para gerar o livro e será excluída automaticamente conforme nossa política de privacidade.";
export const CONSENT_TEXT =
  "Confirmo que sou responsável pela criança ou tenho autorização do responsável para utilizar esta foto na criação do livro.";
