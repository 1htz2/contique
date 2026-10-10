import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { z } from "zod";
import { PAYER_EMAIL_DOMAIN } from "@/lib/site";
import { priceOf, requireEnv, type Product } from "./env";

export type MpPayment = Awaited<ReturnType<Payment["get"]>>;

export const PIX_TTL_MINUTES = 30;
const DESCRIPTION: Record<Product, string> = {
  book: "Contique - Livro personalizado",
  coloring: "Contique - Livro para colorir",
};

// Ties a charge to one book and one product. Parsed back on every sync, never trusted alone.
export const externalReference = (bookId: string, product: Product) => `${bookId}|${product}`;

let client: Payment | undefined;
const payments = () =>
  (client ??= new Payment(
    new MercadoPagoConfig({ accessToken: requireEnv("MERCADOPAGO_ACCESS_TOKEN"), options: { timeout: 10_000 } }),
  ));

// MP wants yyyy-MM-ddTHH:mm:ss.SSS±hh:mm. Brazil has had no DST since 2019, so -03:00 is fixed.
export function mpDate(date: Date): string {
  return new Date(date.getTime() - 3 * 3600_000).toISOString().replace("Z", "-03:00");
}

// Notifications come from the application webhook configured in the MP panel, which is signed. A
// per-payment notification_url would add a second, unsigned delivery that the webhook must reject.
export function createPixPayment({
  bookId,
  product,
  idempotencyKey,
}: {
  bookId: string;
  product: Product;
  idempotencyKey: string;
}) {
  return payments().create({
    body: {
      transaction_amount: priceOf(product),
      payment_method_id: "pix",
      description: DESCRIPTION[product],
      external_reference: externalReference(bookId, product),
      date_of_expiration: mpDate(new Date(Date.now() + PIX_TTL_MINUTES * 60_000)),
      // We collect no email, but MP requires payer.email for Pix. A stable synthetic address per
      // session keeps MP's fraud checks consistent across retries without asking the buyer. The
      // domain is fixed because MP rejects hosts like localhost or preview URLs.
      payer: { email: `cliente+${bookId.replaceAll("-", "").slice(0, 12)}@${PAYER_EMAIL_DOMAIN}` },
    },
    requestOptions: { idempotencyKey },
  });
}

export const CardFormData = z.object({
  token: z.string().min(1).max(200),
  issuer_id: z.union([z.string(), z.number()]).optional(),
  payment_method_id: z.string().min(1).max(50),
  payer: z.object({
    email: z.email().max(200),
    identification: z
      .object({ type: z.string().max(20), number: z.string().max(30) })
      .optional(),
  }),
});
export type CardFormData = z.infer<typeof CardFormData>;

export function createCardPayment({
  bookId,
  product,
  idempotencyKey,
  formData,
}: {
  bookId: string;
  product: Product;
  idempotencyKey: string;
  formData: CardFormData;
}) {
  const issuerId = Number(formData.issuer_id);
  return payments().create({
    body: {
      transaction_amount: priceOf(product),
      installments: 1,
      token: formData.token,
      payment_method_id: formData.payment_method_id,
      issuer_id: Number.isFinite(issuerId) && issuerId > 0 ? issuerId : undefined,
      payer: { email: formData.payer.email, identification: formData.payer.identification },
      description: DESCRIPTION[product],
      external_reference: externalReference(bookId, product),
    },
    requestOptions: { idempotencyKey },
  });
}

export const getPayment = (id: string) => payments().get({ id });

const SIGNATURE_MAX_AGE_MS = 15 * 60_000;

// https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
export function verifyWebhookSignature({
  xSignature,
  xRequestId,
  dataId,
  secret,
  now = Date.now(),
}: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secret: string;
  now?: number;
}): boolean {
  if (!xSignature || !xRequestId || !dataId) return false;
  const parts = Object.fromEntries(
    xSignature.split(",").map((part) => {
      const [key, ...value] = part.split("=");
      return [key.trim(), value.join("=").trim()];
    }),
  );
  const { ts, v1 } = parts;
  if (!ts || !v1 || !/^\d+$/.test(ts) || !/^[0-9a-f]{64}$/i.test(v1)) return false;

  const tsMs = ts.length > 11 ? Number(ts) : Number(ts) * 1000;
  if (Math.abs(now - tsMs) > SIGNATURE_MAX_AGE_MS) return false;

  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest();
  return timingSafeEqual(expected, Buffer.from(v1, "hex"));
}
