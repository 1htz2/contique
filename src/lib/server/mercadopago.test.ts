import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { verifyWebhookSignature, mpDate } = await import("./mercadopago");

// Computed with: printf 'id:123456789;request-id:bb56a2f1-...;ts:1759680000;' | openssl dgst -sha256 -hmac test-webhook-secret
const V1 = "5579a5b92d0ad101a5f33e0a4bb65157e346f7ccae9047dfe88329c9134451cd";
const TS = 1759680000;
const valid = {
  xSignature: `ts=${TS},v1=${V1}`,
  xRequestId: "bb56a2f1-6aae-46ac-982e-9dcd3581d08e",
  dataId: "123456789",
  secret: "test-webhook-secret",
  now: TS * 1000 + 60_000,
};

describe("verifyWebhookSignature", () => {
  it("accepts the official manifest signed with the secret", () => {
    expect(verifyWebhookSignature(valid)).toBe(true);
    expect(verifyWebhookSignature({ ...valid, xSignature: ` v1=${V1} , ts=${TS} ` })).toBe(true);
  });

  it("rejects a tampered data id", () => {
    expect(verifyWebhookSignature({ ...valid, dataId: "123456780" })).toBe(false);
  });

  it("rejects a tampered request id", () => {
    expect(verifyWebhookSignature({ ...valid, xRequestId: "other" })).toBe(false);
  });

  it("rejects a wrong secret", () => {
    expect(verifyWebhookSignature({ ...valid, secret: "another-secret" })).toBe(false);
  });

  it("rejects a timestamp older than 15 minutes", () => {
    expect(verifyWebhookSignature({ ...valid, now: TS * 1000 + 16 * 60_000 })).toBe(false);
  });

  it("rejects missing or malformed headers", () => {
    expect(verifyWebhookSignature({ ...valid, xSignature: null })).toBe(false);
    expect(verifyWebhookSignature({ ...valid, xRequestId: null })).toBe(false);
    expect(verifyWebhookSignature({ ...valid, xSignature: `ts=${TS}` })).toBe(false);
    expect(verifyWebhookSignature({ ...valid, xSignature: `ts=${TS},v1=abc` })).toBe(false);
  });
});

describe("mpDate", () => {
  it("formats in Brasília time with an explicit offset", () => {
    expect(mpDate(new Date("2026-10-05T15:30:00.000Z"))).toBe("2026-10-05T12:30:00.000-03:00");
  });
});
