import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { sendServerEvent, sha256 } from "@/lib/analytics/server";
import type { PaymentStatus, PaymentStatusResponse, PixCheckoutResponse } from "@/lib/contracts";
import { isPaid } from "./books";
import { env, priceOf, type Product } from "./env";
import {
  createCardPayment,
  createPixPayment,
  externalReference,
  PIX_TTL_MINUTES,
  type CardFormData,
  type MpPayment,
} from "./mercadopago";
import { onPaymentApproved } from "./pipeline";
import { db } from "./supabase";

// `status` holds Mercado Pago's status string verbatim, plus our own `creating` (row inserted,
// MP not called yet) and `error` (MP call failed).
export type PaymentRow = {
  id: string;
  book_id: string;
  product: Product;
  provider_payment_id: string | null;
  idempotency_key: string;
  method: "pix" | "card";
  amount: number;
  currency: "BRL";
  status: string;
  status_detail: string | null;
  qr_code: string | null;
  qr_code_base64: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  purchase_event_sent_at: string | null;
  superseded_at: string | null;
};

const PENDING = ["creating", "pending", "in_process", "authorized"];

export function clientStatus(row: Pick<PaymentRow, "status" | "expires_at">, now = Date.now()): PaymentStatus {
  switch (row.status) {
    case "approved":
      return "approved";
    case "rejected":
    case "refunded":
    case "charged_back":
    case "in_mediation":
      return "rejected";
    case "cancelled":
    case "expired":
      return "expired";
    case "error":
      return "none";
    default:
      return row.expires_at && Date.parse(row.expires_at) <= now ? "expired" : "pending";
  }
}

export function statusResponse(row: PaymentRow | null): PaymentStatusResponse {
  if (!row) return { status: "none" };
  const status = clientStatus(row);
  if (status !== "approved") return { status };
  return { status, purchaseEventId: row.id, value: Number(row.amount), currency: "BRL" };
}

const payments = () => db().from("payments");

async function single(query: PromiseLike<{ data: PaymentRow[] | null; error: { message: string } | null }>) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

async function exec(query: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await query;
  if (error) throw new Error(error.message);
}

const byId = (id: string) => single(payments().select("*").eq("id", id).limit(1));

// The payment the buyer is waiting on: an approval wins, then a charge that can still be paid, so a
// failed or rejected card attempt never hides the Pix the buyer may still pay.
export async function latestPayment(bookId: string, product: Product): Promise<PaymentRow | null> {
  const forProduct = () => payments().select("*").eq("book_id", bookId).eq("product", product);
  const newest = { ascending: false } as const;
  return (
    (await single(forProduct().eq("status", "approved").limit(1))) ??
    (await single(forProduct().in("status", PENDING).is("superseded_at", null).order("created_at", newest).limit(1))) ??
    (await single(forProduct().neq("status", "error").order("created_at", newest).limit(1)))
  );
}

const pixResponse = (row: PaymentRow): PixCheckoutResponse => ({
  paymentId: row.id,
  qrCode: row.qr_code!,
  qrCodeBase64: row.qr_code_base64!,
  expiresAt: row.expires_at!,
  amount: Number(row.amount),
});

export type PixCheckoutResult =
  | { kind: "already_paid" }
  | { kind: "pix"; pix: PixCheckoutResponse }
  | { kind: "busy" }
  | { kind: "provider_error" };

const REUSE_MIN_REMAINING_MS = 2 * 60_000;
const STALE_CREATING_MS = 30_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Converges on one open Pix per book and product: the partial unique index payments_one_open_pix_idx
// rejects a second open row, so a double tap waits for the first charge instead of creating one.
export async function startPixCheckout(bookId: string, product: Product): Promise<PixCheckoutResult> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (await isPaid(bookId, product)) return { kind: "already_paid" };

    const open = await single(
      payments()
        .select("*")
        .eq("book_id", bookId)
        .eq("product", product)
        .eq("method", "pix")
        .is("superseded_at", null)
        .in("status", ["creating", "pending"])
        .limit(1),
    );

    if (open?.status === "pending") {
      const remaining = open.expires_at ? Date.parse(open.expires_at) - Date.now() : 0;
      if (open.qr_code && remaining > REUSE_MIN_REMAINING_MS) return { kind: "pix", pix: pixResponse(open) };
      await payments().update({ superseded_at: new Date().toISOString() }).eq("id", open.id).is("superseded_at", null);
      continue;
    }

    if (open?.status === "creating") {
      // The creator crashed mid-call. Retrying with its idempotency key returns the same MP charge.
      if (Date.now() - Date.parse(open.created_at) > STALE_CREATING_MS) return createPix(open);
      await sleep(500);
      continue;
    }

    const { data, error } = await payments()
      .insert({
        book_id: bookId,
        product,
        idempotency_key: randomUUID(),
        method: "pix",
        amount: priceOf(product),
        status: "creating",
      })
      .select("*")
      .single<PaymentRow>();
    if (error?.code === "23505") continue;
    if (error) throw new Error(error.message);
    return createPix(data);
  }
  return { kind: "busy" };
}

async function createPix(row: PaymentRow): Promise<PixCheckoutResult> {
  let mp: MpPayment;
  try {
    mp = await createPixPayment({ bookId: row.book_id, product: row.product, idempotencyKey: row.idempotency_key });
  } catch (error) {
    return markError(row, error);
  }
  const data = mp.point_of_interaction?.transaction_data;
  if (!mp.id || !data?.qr_code || !data.qr_code_base64) return markError(row, new Error("pix without qr code"));

  const { error } = await payments()
    .update({
      provider_payment_id: String(mp.id),
      qr_code: data.qr_code,
      qr_code_base64: data.qr_code_base64,
      expires_at: mp.date_of_expiration ?? new Date(Date.now() + PIX_TTL_MINUTES * 60_000).toISOString(),
    })
    .eq("id", row.id);
  if (error) throw new Error(error.message);
  const synced = await syncPayment(mp);
  if (!synced) throw new Error(`pix ${mp.id} did not sync`);
  if (synced.status === "approved") return { kind: "already_paid" };
  return { kind: "pix", pix: pixResponse(synced) };
}

async function markError(row: PaymentRow, error: unknown): Promise<{ kind: "provider_error" }> {
  console.error(`mercadopago create failed for payment ${row.id}`, describeMpError(error));
  await payments()
    .update({ status: "error", status_detail: describeMpError(error).slice(0, 300), updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "creating")
    .is("provider_payment_id", null);
  return { kind: "provider_error" };
}

// MP puts the actionable reason in `cause` ({ code, description }[]), not in the message.
function describeMpError(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const { status, message, cause } = error as { status?: number; message?: string; cause?: unknown };
  const detail = Array.isArray(cause) ? ` ${JSON.stringify(cause)}` : "";
  return `${status ?? ""} ${message ?? ""}${detail}`.trim();
}

export async function startCardCheckout(
  bookId: string,
  product: Product,
  formData: CardFormData,
): Promise<{ kind: "already_paid" } | { kind: "provider_error" } | { kind: "paid_status"; status: PaymentStatus }> {
  if (await isPaid(bookId, product)) return { kind: "already_paid" };
  const { data: row, error } = await payments()
    .insert({
      book_id: bookId,
      product,
      idempotency_key: randomUUID(),
      method: "card",
      amount: priceOf(product),
      status: "creating",
    })
    .select("*")
    .single<PaymentRow>();
  if (error) throw new Error(error.message);

  let mp: MpPayment;
  try {
    mp = await createCardPayment({ bookId, product, idempotencyKey: row.idempotency_key, formData });
  } catch (err) {
    return markError(row, err);
  }
  if (!mp.id) return markError(row, new Error("card payment without id"));
  await exec(payments().update({ provider_payment_id: String(mp.id) }).eq("id", row.id));
  const synced = await syncPayment(mp);
  return { kind: "paid_status", status: synced ? clientStatus(synced) : "pending" };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseExternalReference(ref: string | null | undefined): { bookId: string; product: Product } | null {
  const [bookId, product] = (ref ?? "").split("|");
  if (!UUID.test(bookId ?? "") || (product !== "book" && product !== "coloring")) return null;
  return { bookId, product };
}

// A notification can beat our own write of provider_payment_id, and a create that timed out on
// our side may still have succeeded at MP. Either way the charge belongs to a row of ours that
// has no provider id yet.
async function adoptOrphan(mp: MpPayment, providerId: string): Promise<PaymentRow | null> {
  const ref = parseExternalReference(mp.external_reference);
  if (!ref) return null;
  const orphan = await single(
    payments()
      .select("*")
      .eq("book_id", ref.bookId)
      .eq("product", ref.product)
      .eq("method", mp.payment_method_id === "pix" ? "pix" : "card")
      .is("provider_payment_id", null)
      .in("status", ["creating", "error"])
      .order("created_at", { ascending: false })
      .limit(1),
  );
  if (!orphan) return null;
  const { data } = await payments()
    .update({
      provider_payment_id: providerId,
      // An adopted failed row must not compete with a newer open Pix for the one-open-Pix slot.
      superseded_at: orphan.status === "error" ? new Date().toISOString() : orphan.superseded_at,
    })
    .eq("id", orphan.id)
    .is("provider_payment_id", null)
    .select("*");
  return (data as PaymentRow[] | null)?.[0] ?? (await single(payments().select("*").eq("provider_payment_id", providerId)));
}

// The single place payment state changes. Both the webhook and the status poll call it with a
// payment freshly fetched from MP, so repeated or concurrent calls converge on MP's state.
export async function syncPayment(mp: MpPayment): Promise<PaymentRow | null> {
  const providerId = mp.id ? String(mp.id) : null;
  if (!providerId || !mp.status) return null;
  const row =
    (await single(payments().select("*").eq("provider_payment_id", providerId).limit(1))) ??
    (await adoptOrphan(mp, providerId));
  if (!row) {
    console.warn(`ignoring mercadopago payment ${providerId}: no matching row`);
    return null;
  }
  if (mp.external_reference !== externalReference(row.book_id, row.product)) {
    console.error(`mercadopago payment ${providerId} external_reference mismatch`);
    return row;
  }

  const now = new Date().toISOString();
  const change = {
    status: mp.status,
    status_detail: mp.status_detail ?? null,
    live_mode: mp.live_mode ?? null,
    updated_at: now,
  };
  if (mp.status === "approved") {
    if ((mp.transaction_amount ?? 0) < Number(row.amount) || (mp.currency_id && mp.currency_id !== "BRL")) {
      console.error(`mercadopago payment ${providerId} approved with unexpected amount ${mp.transaction_amount}`);
      return row;
    }
    await exec(payments().update({ ...change, approved_at: now }).eq("id", row.id).neq("status", "approved"));
  } else if (PENDING.includes(mp.status)) {
    // A slower, older read must not move a settled payment back to pending.
    await exec(payments().update(change).eq("id", row.id).in("status", PENDING));
  } else {
    await exec(payments().update(change).eq("id", row.id));
  }

  if (mp.status === "approved") {
    // Idempotent: unlocking an already unlocked book changes nothing.
    await onPaymentApproved(row.book_id, row.product);
  }

  const { data: claimed } = await payments()
    .update({ purchase_event_sent_at: now })
    .eq("id", row.id)
    .eq("status", "approved")
    .is("purchase_event_sent_at", null)
    .select("*");
  const claimedRow = (claimed as PaymentRow[] | null)?.[0];
  if (claimedRow) after(() => sendPurchase(claimedRow));

  return claimedRow ?? (await byId(row.id));
}

async function sendPurchase(payment: PaymentRow) {
  const { data: book } = await db()
    .from("books")
    .select("visitor_id, fbp, fbc, fbclid, ttclid, client_ip, client_user_agent, created_at")
    .eq("id", payment.book_id)
    .single();
  await db()
    .from("events")
    .upsert(
      {
        book_id: payment.book_id,
        visitor_id: book?.visitor_id ?? null,
        event_name: payment.product === "book" ? "payment_approved" : "coloring_upsell_purchased",
        event_id: payment.id,
        properties: { source: "server", method: payment.method, value: Number(payment.amount) },
      },
      { onConflict: "event_name,event_id", ignoreDuplicates: true },
    );
  await sendServerEvent({
    name: "Purchase",
    eventId: payment.id,
    eventSourceUrl: new URL("/livro", env().NEXT_PUBLIC_SITE_URL).toString(),
    value: Number(payment.amount),
    currency: "BRL",
    user: {
      ip: book?.client_ip,
      ua: book?.client_user_agent,
      fbp: book?.fbp,
      fbc: book?.fbc ?? (book?.fbclid ? `fb.1.${Date.parse(book.created_at)}.${book.fbclid}` : null),
      ttclid: book?.ttclid,
      externalId: book?.visitor_id ? sha256(book.visitor_id) : null,
    },
  });
}
