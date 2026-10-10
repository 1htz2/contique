import { requireEnv } from "@/lib/server/env";
import { getPayment, verifyWebhookSignature } from "@/lib/server/mercadopago";
import { syncPayment } from "@/lib/server/payments";
import { readJson } from "@/lib/server/request";

type Notification = { type?: unknown; topic?: unknown; data?: { id?: unknown } };

const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : null;

// The approval starts the paid generation in after().
export const maxDuration = 300;

// The body is used only to learn which payment changed. Its contents are never trusted: the
// payment is always fetched from MP, so repeated deliveries converge on the same row state.
export async function POST(req: Request) {
  const query = new URL(req.url).searchParams;
  const body = ((await readJson(req)) ?? {}) as Notification;

  const topic = query.get("type") ?? query.get("topic") ?? text(body.type) ?? text(body.topic);
  if (topic !== "payment") return new Response(null, { status: 200 });

  const dataId = query.get("data.id") ?? query.get("id") ?? text(body.data?.id);
  const signed = verifyWebhookSignature({
    xSignature: req.headers.get("x-signature"),
    xRequestId: req.headers.get("x-request-id"),
    dataId,
    secret: requireEnv("MERCADOPAGO_WEBHOOK_SECRET"),
  });
  if (!signed || !dataId || !/^\d{1,20}$/.test(dataId)) return new Response(null, { status: 401 });

  try {
    await syncPayment(await getPayment(dataId));
  } catch (error) {
    console.error(`webhook sync failed for payment ${dataId}`, error instanceof Error ? error.message : error);
    // A payment MP does not know will never sync, so retrying it is pointless.
    const notFound = (error as { status?: number }).status === 404;
    return new Response(null, { status: notFound ? 200 : 500 });
  }
  return new Response(null, { status: 200 });
}
