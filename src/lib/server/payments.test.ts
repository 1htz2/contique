import { createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
// The webhook test signs its own deliveries, so any secret works when none is configured locally.
process.env.MERCADOPAGO_WEBHOOK_SECRET ||= "test-webhook-secret-0123456789";

const afterQueue: (() => unknown)[] = [];
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => afterQueue.push(fn) }));
vi.mock("@/lib/analytics/server", async (importActual) => ({
  ...(await importActual<object>()),
  sendServerEvent: vi.fn(async () => {}),
}));
// The pipeline is verified on its own (pnpm verify:pipeline); here only the hand-off matters.
vi.mock("./pipeline", () => ({ onPaymentApproved: vi.fn(async () => {}) }));
vi.mock("./mercadopago", async (importActual) => ({
  ...(await importActual<object>()),
  getPayment: vi.fn(),
  createPixPayment: vi.fn(),
}));

const { sendServerEvent } = await import("@/lib/analytics/server");
const mp = await import("./mercadopago");
const { clientStatus, startPixCheckout, syncPayment, latestPayment } = await import("./payments");
const { isPaid } = await import("./books");
const { onPaymentApproved } = await import("./pipeline");
const { db } = await import("./supabase");
const webhook = await import("@/app/api/webhooks/mercadopago/route");

const getPayment = vi.mocked(mp.getPayment);
const createPixPayment = vi.mocked(mp.createPixPayment);
const sent = vi.mocked(sendServerEvent);

describe("clientStatus", () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 1000).toISOString();
  it.each([
    ["approved", future, "approved"],
    ["pending", future, "pending"],
    ["in_process", null, "pending"],
    ["authorized", null, "pending"],
    ["creating", null, "pending"],
    ["rejected", null, "rejected"],
    ["cancelled", null, "expired"],
    ["expired", null, "expired"],
    ["refunded", null, "rejected"],
    ["charged_back", null, "rejected"],
    ["pending", past, "expired"],
    ["approved", past, "approved"],
    ["error", null, "none"],
  ] as const)("%s (expires %s) maps to %s", (status, expires_at, expected) => {
    expect(clientStatus({ status, expires_at })).toBe(expected);
  });
});

const dbAvailable = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbAvailable)("payments against the local database", () => {
  async function newBook() {
    const { data, error } = await db()
      .from("books")
      .insert({
        id: randomUUID(),
        token: randomBytes(32).toString("base64url"),
        status: "preview_ready",
        visitor_id: "test-visitor",
        consent_at: new Date().toISOString(),
        child_first_name: "Teste",
        child_age: 6,
        child_pronoun: "neutro",
        theme: "espaco",
        fbclid: "test-fbclid",
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  async function newPendingPix(bookId: string) {
    const providerId = String(randomInt(1e9, 9e9));
    const { data, error } = await db()
      .from("payments")
      .insert({
        book_id: bookId,
        product: "book",
        provider_payment_id: providerId,
        idempotency_key: randomUUID(),
        method: "pix",
        amount: 14.9,
        status: "pending",
        expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    return { paymentId: data.id as string, providerId };
  }

  const row = async (id: string) =>
    (await db().from("payments").select("*").eq("id", id).single()).data;

  const mpPayment = (providerId: string, bookId: string, status: string) =>
    ({
      id: Number(providerId),
      status,
      status_detail: status === "approved" ? "accredited" : "pending_waiting_transfer",
      external_reference: `${bookId}|book`,
      transaction_amount: 14.9,
      currency_id: "BRL",
      payment_method_id: "pix",
    }) as Awaited<ReturnType<typeof mp.getPayment>>;

  function delivery(dataId: string, { body = {}, secret = process.env.MERCADOPAGO_WEBHOOK_SECRET! } = {}) {
    const ts = String(Math.floor(Date.now() / 1000));
    const requestId = randomUUID();
    const v1 = createHmac("sha256", secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex");
    return new Request(`http://localhost/api/webhooks/mercadopago?data.id=${dataId}&type=payment`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId },
      body: JSON.stringify({ type: "payment", action: "payment.updated", data: { id: dataId }, ...body }),
    });
  }

  async function drainAfter() {
    while (afterQueue.length) await afterQueue.shift()!();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    afterQueue.length = 0;
  });

  it("approves once and claims Purchase once across repeated webhook deliveries", async () => {
    const bookId = await newBook();
    const { paymentId, providerId } = await newPendingPix(bookId);
    getPayment.mockResolvedValue(mpPayment(providerId, bookId, "approved"));

    expect((await webhook.POST(delivery(providerId))).status).toBe(200);
    await drainAfter();
    const first = await row(paymentId);
    expect(first.status).toBe("approved");
    expect(first.approved_at).not.toBeNull();
    expect(first.purchase_event_sent_at).not.toBeNull();

    expect((await webhook.POST(delivery(providerId))).status).toBe(200);
    await drainAfter();
    const second = await row(paymentId);
    expect(second.approved_at).toBe(first.approved_at);
    expect(second.purchase_event_sent_at).toBe(first.purchase_event_sent_at);

    expect(getPayment).toHaveBeenCalledTimes(2);
    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Purchase", eventId: paymentId, value: 14.9, currency: "BRL" }),
    );
    expect(sent.mock.calls[0][0].user.fbc).toMatch(/^fb\.1\.\d+\.test-fbclid$/);
    expect(await isPaid(bookId, "book")).toBe(true);
    expect(onPaymentApproved).toHaveBeenCalledWith(bookId, "book");
    expect(await isPaid(bookId, "coloring")).toBe(false);
    const { count } = await db()
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("event_name", "payment_approved")
      .eq("event_id", paymentId);
    expect(count).toBe(1);
  });

  it("claims Purchase once when deliveries race", async () => {
    const bookId = await newBook();
    const { paymentId, providerId } = await newPendingPix(bookId);
    getPayment.mockResolvedValue(mpPayment(providerId, bookId, "approved"));

    const statuses = await Promise.all([1, 2, 3, 4].map(() => webhook.POST(delivery(providerId))));
    await drainAfter();

    expect(statuses.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(sent).toHaveBeenCalledTimes(1);
    expect((await row(paymentId)).status).toBe("approved");
  });

  it("rejects a bad signature without touching MP", async () => {
    const bookId = await newBook();
    const { paymentId, providerId } = await newPendingPix(bookId);
    const res = await webhook.POST(delivery(providerId, { secret: "not-the-secret" }));
    expect(res.status).toBe(401);
    expect(getPayment).not.toHaveBeenCalled();
    expect((await row(paymentId)).status).toBe("pending");
  });

  it("trusts MP, not the notification body", async () => {
    const bookId = await newBook();
    const { paymentId, providerId } = await newPendingPix(bookId);
    getPayment.mockResolvedValue(mpPayment(providerId, bookId, "pending"));
    const res = await webhook.POST(delivery(providerId, { body: { status: "approved" } }));
    expect(res.status).toBe(200);
    expect((await row(paymentId)).status).toBe("pending");
    expect(await isPaid(bookId, "book")).toBe(false);
  });

  it("asks MP to retry when fetching the payment fails", async () => {
    const bookId = await newBook();
    const { providerId } = await newPendingPix(bookId);
    getPayment.mockRejectedValue(Object.assign(new Error("boom"), { status: 503 }));
    expect((await webhook.POST(delivery(providerId))).status).toBe(500);
  });

  it("never moves an approved payment back to pending, and a refund re-locks the book", async () => {
    const bookId = await newBook();
    const { paymentId, providerId } = await newPendingPix(bookId);
    await syncPayment(mpPayment(providerId, bookId, "approved"));
    await syncPayment(mpPayment(providerId, bookId, "pending"));
    expect((await row(paymentId)).status).toBe("approved");

    await syncPayment(mpPayment(providerId, bookId, "refunded"));
    expect(await isPaid(bookId, "book")).toBe(false);
    expect(clientStatus((await latestPayment(bookId, "book"))!)).toBe("rejected");
  });

  it("keeps reporting an open Pix after a later card attempt fails or is rejected", async () => {
    const bookId = await newBook();
    const { paymentId } = await newPendingPix(bookId);
    for (const status of ["error", "rejected"]) {
      const { error } = await db().from("payments").insert({
        book_id: bookId,
        product: "book",
        idempotency_key: randomUUID(),
        method: "card",
        amount: 14.9,
        status,
      });
      if (error) throw error;
      const latest = await latestPayment(bookId, "book");
      expect(latest?.id, `after a ${status} card`).toBe(paymentId);
      expect(clientStatus(latest!)).toBe("pending");
    }
  });

  it("ignores a charge whose external reference names another product", async () => {
    const bookId = await newBook();
    const { paymentId, providerId } = await newPendingPix(bookId);
    await syncPayment({ ...mpPayment(providerId, bookId, "approved"), external_reference: `${bookId}|coloring` });
    expect((await row(paymentId)).status).toBe("pending");
    expect(onPaymentApproved).not.toHaveBeenCalled();
  });

  it("refuses an approval for less than the price", async () => {
    const bookId = await newBook();
    const { paymentId, providerId } = await newPendingPix(bookId);
    await syncPayment({ ...mpPayment(providerId, bookId, "approved"), transaction_amount: 0.01 });
    expect((await row(paymentId)).status).toBe("pending");
    expect(sent).not.toHaveBeenCalled();
  });

  describe("startPixCheckout", () => {
    let created = 0;
    beforeEach(() => {
      created = 0;
      createPixPayment.mockImplementation(async ({ bookId, product }) => {
        created++;
        await new Promise((resolve) => setTimeout(resolve, 300));
        return {
          id: randomInt(1e9, 9e9),
          status: "pending",
          external_reference: `${bookId}|${product}`,
          transaction_amount: 14.9,
          currency_id: "BRL",
          payment_method_id: "pix",
          date_of_expiration: new Date(Date.now() + 30 * 60_000).toISOString(),
          point_of_interaction: { transaction_data: { qr_code: `pix-${created}`, qr_code_base64: "iVBOR" } },
        } as Awaited<ReturnType<typeof mp.createPixPayment>>;
      });
    });

    it("creates one charge for concurrent taps and reuses it on revisit", async () => {
      const bookId = await newBook();
      const results = await Promise.all([1, 2, 3, 4, 5].map(() => startPixCheckout(bookId, "book")));
      expect(createPixPayment).toHaveBeenCalledTimes(1);
      const ids = new Set(results.map((r) => (r.kind === "pix" ? r.pix.paymentId : r.kind)));
      expect(ids.size).toBe(1);
      expect(results[0]).toMatchObject({ kind: "pix", pix: { qrCode: "pix-1", amount: 14.9 } });

      const again = await startPixCheckout(bookId, "book");
      expect(createPixPayment).toHaveBeenCalledTimes(1);
      expect(again).toEqual(results[0]);
    });

    it("replaces a Pix that expires within two minutes and keeps the old row payable", async () => {
      const bookId = await newBook();
      const first = await startPixCheckout(bookId, "book");
      if (first.kind !== "pix") throw new Error(first.kind);
      await db()
        .from("payments")
        .update({ expires_at: new Date(Date.now() + 60_000).toISOString() })
        .eq("id", first.pix.paymentId);

      const second = await startPixCheckout(bookId, "book");
      if (second.kind !== "pix") throw new Error(second.kind);
      expect(second.pix.paymentId).not.toBe(first.pix.paymentId);
      expect(createPixPayment).toHaveBeenCalledTimes(2);
      expect((await row(first.pix.paymentId)).superseded_at).not.toBeNull();

      const old = await row(first.pix.paymentId);
      await syncPayment(mpPayment(old.provider_payment_id, bookId, "approved"));
      expect(await isPaid(bookId, "book")).toBe(true);
      expect(await startPixCheckout(bookId, "book")).toEqual({ kind: "already_paid" });
    });

    it("marks the row as error when MP fails", async () => {
      const bookId = await newBook();
      createPixPayment.mockRejectedValueOnce(Object.assign(new Error("unauthorized"), { status: 401 }));
      expect(await startPixCheckout(bookId, "book")).toEqual({ kind: "provider_error" });
      const { data } = await db().from("payments").select("status").eq("book_id", bookId);
      expect(data).toEqual([{ status: "error" }]);
    });
  });
});
