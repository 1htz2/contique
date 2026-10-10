import { z } from "zod";
import type { PixCheckoutResponse } from "@/lib/contracts";
import { canBuy, findBookByToken } from "@/lib/server/books";
import { recordEvent } from "@/lib/server/events";
import { startPixCheckout } from "@/lib/server/payments";
import { rateLimit } from "@/lib/server/rate-limit";
import { apiError, json, readJson } from "@/lib/server/request";

// An approval seen here starts the paid generation in after().
export const maxDuration = 300;

const Body = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), product: z.enum(["book", "coloring"]) });

export async function POST(req: Request) {
  if (!(await rateLimit(req, "checkoutPix"))) return apiError("rate_limited", 429);
  const body = Body.safeParse(await readJson(req));
  if (!body.success) return apiError("invalid_request", 400);

  const book = await findBookByToken(body.data.token);
  if (!book) return apiError("not_found", 404);
  const { product } = body.data;
  if (!canBuy(book, product)) return apiError(book.status === "deleted" ? "deleted" : "already_paid", 409);

  const result = await startPixCheckout(book.id, product);
  switch (result.kind) {
    case "already_paid":
      return apiError("already_paid", 409);
    case "busy":
      return apiError("checkout_busy", 503);
    case "provider_error":
      return apiError("payment_provider_error", 502);
    case "pix":
      await recordEvent(book.id, "pix_generated", result.pix.paymentId, { product });
      return json<PixCheckoutResponse>(result.pix);
  }
}
