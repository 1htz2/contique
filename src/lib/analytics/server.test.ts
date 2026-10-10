import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const BASE_ENV = {
  NEXT_PUBLIC_SITE_URL: "https://perfil.example",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40),
  MERCADOPAGO_ACCESS_TOKEN: "TEST-0000000000",
  MERCADOPAGO_WEBHOOK_SECRET: "secret-secret",
  ADMIN_USER: "admin",
  ADMIN_PASSWORD: "a-long-password",
};

async function load(extra: Record<string, string> = {}) {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries({ ...BASE_ENV, ...extra })) vi.stubEnv(k, v);
  return import("./server");
}

const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const purchase = {
  name: "Purchase" as const,
  eventId: "pay-1",
  eventSourceUrl: "https://perfil.example/livro",
  value: 7.9,
  currency: "BRL" as const,
  user: { ip: "1.2.3.4", ua: "UA", fbp: "fb.1.1.1", fbc: "fb.1.2.abc", externalId: "hash", ttclid: "tt" },
};

describe("sendServerEvent", () => {
  it("is a no-op without credentials", async () => {
    const { sendServerEvent } = await load();
    await sendServerEvent(purchase);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends Purchase to Meta CAPI and TikTok with the same event id", async () => {
    const { sendServerEvent } = await load({
      META_PIXEL_ID: "111",
      META_CAPI_ACCESS_TOKEN: "meta-token",
      META_TEST_EVENT_CODE: "TEST123",
      TIKTOK_PIXEL_ID: "222",
      TIKTOK_EVENTS_ACCESS_TOKEN: "tt-token",
    });
    await sendServerEvent(purchase);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const [metaUrl, metaInit] = calls.find(([url]) => url.includes("graph.facebook.com"))!;
    const [, ttInit] = calls.find(([url]) => url.includes("business-api.tiktok.com"))!;

    expect(metaUrl).toBe("https://graph.facebook.com/v21.0/111/events?access_token=meta-token");
    const meta = JSON.parse(metaInit.body as string);
    expect(meta.test_event_code).toBe("TEST123");
    expect(meta.data[0]).toMatchObject({
      event_name: "Purchase",
      event_id: "pay-1",
      action_source: "website",
      user_data: { client_ip_address: "1.2.3.4", fbp: "fb.1.1.1", fbc: "fb.1.2.abc", external_id: ["hash"] },
      custom_data: { value: 7.9, currency: "BRL" },
    });

    expect((ttInit.headers as Record<string, string>)["Access-Token"]).toBe("tt-token");
    const tt = JSON.parse(ttInit.body as string);
    expect(tt).toMatchObject({ event_source: "web", event_source_id: "222" });
    expect(tt.data[0]).toMatchObject({
      event: "CompletePayment",
      event_id: "pay-1",
      user: { ttclid: "tt", external_id: "hash" },
      properties: { value: 7.9, currency: "BRL" },
    });
  });

  it("never throws when a platform is down", async () => {
    const { sendServerEvent } = await load({ META_PIXEL_ID: "111", META_CAPI_ACCESS_TOKEN: "t" });
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(sendServerEvent(purchase)).resolves.toBeUndefined();
  });
});

describe("eventSourceUrl", () => {
  it("strips the result token and query string", async () => {
    const { eventSourceUrl } = await load();
    expect(eventSourceUrl("https://perfil.example/livro/abcDEF_123?utm_source=x")).toBe(
      "https://perfil.example/livro",
    );
    expect(eventSourceUrl("https://perfil.example/quiz?fbclid=1")).toBe("https://perfil.example/quiz");
    expect(eventSourceUrl(null)).toBe("https://perfil.example/");
  });
});
