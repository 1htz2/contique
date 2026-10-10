import { z } from "zod";
import type { PaymentStatusResponse } from "@/lib/contracts";
import { findBookByToken } from "@/lib/server/books";
import { getPayment } from "@/lib/server/mercadopago";
import { clientStatus, latestPayment, statusResponse, syncPayment } from "@/lib/server/payments";
import { rateLimit } from "@/lib/server/rate-limit";
import { apiError, json } from "@/lib/server/request";

// A sync that sees the approval starts the paid generation in after().
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" };
const REFRESH_AFTER_MS = 10_000;
const Product = z.enum(["book", "coloring"]);

export async function GET(req: Request) {
  if (!(await rateLimit(req, "paymentStatus"))) return apiError("rate_limited", 429);
  const query = new URL(req.url).searchParams;
  const product = Product.safeParse(query.get("product") ?? "book");
  if (!product.success) return apiError("invalid_request", 400);
  const book = await findBookByToken(query.get("token") ?? "");
  if (!book) return json({ error: "not_found" }, 404, NO_STORE);

  let payment = await latestPayment(book.id, product.data);
  // Do not depend on the webhook alone: if it is late or lost, ask MP directly.
  if (
    payment?.provider_payment_id &&
    clientStatus(payment) === "pending" &&
    Date.now() - Date.parse(payment.updated_at) > REFRESH_AFTER_MS
  ) {
    try {
      payment = (await syncPayment(await getPayment(payment.provider_payment_id))) ?? payment;
    } catch (error) {
      console.error("payment status refresh failed", error instanceof Error ? error.message : error);
    }
  }
  return json<PaymentStatusResponse>(statusResponse(payment), 200, NO_STORE);
}
