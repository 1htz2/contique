import { z } from "zod";
import type { PaymentStatus } from "@/lib/contracts";
import { canBuy, findBookByToken } from "@/lib/server/books";
import { CardFormData } from "@/lib/server/mercadopago";
import { startCardCheckout } from "@/lib/server/payments";
import { rateLimit } from "@/lib/server/rate-limit";
import { apiError, json, readJson } from "@/lib/server/request";

// An approved card starts the paid generation in after().
export const maxDuration = 300;

// Any amount or installments the client sends is dropped here; the server sets both.
const Body = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  product: z.enum(["book", "coloring"]),
  formData: CardFormData,
});

export async function POST(req: Request) {
  if (!(await rateLimit(req, "checkoutCard"))) return apiError("rate_limited", 429);
  const body = Body.safeParse(await readJson(req));
  if (!body.success) return apiError("invalid_request", 400);

  const book = await findBookByToken(body.data.token);
  if (!book) return apiError("not_found", 404);
  if (!canBuy(book, body.data.product)) return apiError("already_paid", 409);

  const result = await startCardCheckout(book.id, body.data.product, body.data.formData);
  switch (result.kind) {
    case "already_paid":
      return apiError("already_paid", 409);
    case "provider_error":
      return apiError("payment_provider_error", 502);
    case "paid_status":
      return json<{ status: PaymentStatus }>({ status: result.status });
  }
}
