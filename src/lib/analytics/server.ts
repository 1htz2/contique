import "server-only";
import { createHash } from "node:crypto";
import { TIKTOK_EVENT, type StandardEvent } from "@/lib/analytics/events";
import { env } from "@/lib/server/env";

export type ServerEventUser = {
  ip?: string | null;
  ua?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  externalId?: string | null;
  ttclid?: string | null;
};

export type ServerEvent = {
  name: StandardEvent;
  eventId: string;
  eventSourceUrl: string;
  value?: number;
  currency?: "BRL";
  user: ServerEventUser;
};

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

// The result token unlocks a paid report, so it must never reach an ad platform.
export function eventSourceUrl(referer: string | null): string {
  const site = env().NEXT_PUBLIC_SITE_URL;
  let path = "/";
  try {
    path = new URL(referer ?? "/", site).pathname.replace(/^\/livro\/.*/, "/livro");
  } catch {}
  return new URL(path, site).toString();
}

async function post(label: string, url: string, body: unknown, headers: Record<string, string> = {}) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) console.error(`${label} ${res.status}`, (await res.text()).slice(0, 500));
  } catch (error) {
    console.error(`${label} failed`, error instanceof Error ? error.message : error);
  }
}

function sendMeta(event: ServerEvent, eventTime: number) {
  const { META_PIXEL_ID, META_CAPI_ACCESS_TOKEN, META_TEST_EVENT_CODE } = env();
  if (!META_PIXEL_ID || !META_CAPI_ACCESS_TOKEN) return;
  const { user } = event;
  return post(
    "meta capi",
    `https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(META_CAPI_ACCESS_TOKEN)}`,
    {
      data: [
        {
          event_name: event.name,
          event_time: eventTime,
          event_id: event.eventId,
          action_source: "website",
          event_source_url: event.eventSourceUrl,
          user_data: {
            client_ip_address: user.ip ?? undefined,
            client_user_agent: user.ua ?? undefined,
            fbp: user.fbp ?? undefined,
            fbc: user.fbc ?? undefined,
            external_id: user.externalId ? [user.externalId] : undefined,
          },
          custom_data: event.value === undefined ? undefined : { value: event.value, currency: event.currency },
        },
      ],
      test_event_code: META_TEST_EVENT_CODE,
    },
  );
}

function sendTikTok(event: ServerEvent, eventTime: number) {
  const { TIKTOK_PIXEL_ID, TIKTOK_EVENTS_ACCESS_TOKEN, TIKTOK_TEST_EVENT_CODE } = env();
  const tiktokEvent = TIKTOK_EVENT[event.name];
  if (!TIKTOK_PIXEL_ID || !TIKTOK_EVENTS_ACCESS_TOKEN || !tiktokEvent) return;
  const { user } = event;
  return post(
    "tiktok events",
    "https://business-api.tiktok.com/open_api/v1.3/event/track/",
    {
      event_source: "web",
      event_source_id: TIKTOK_PIXEL_ID,
      test_event_code: TIKTOK_TEST_EVENT_CODE,
      data: [
        {
          event: tiktokEvent,
          event_time: eventTime,
          event_id: event.eventId,
          user: {
            ip: user.ip ?? undefined,
            user_agent: user.ua ?? undefined,
            external_id: user.externalId ?? undefined,
            ttclid: user.ttclid ?? undefined,
          },
          page: { url: event.eventSourceUrl },
          properties:
            event.value === undefined ? undefined : { value: event.value, currency: event.currency },
        },
      ],
    },
    { "Access-Token": TIKTOK_EVENTS_ACCESS_TOKEN },
  );
}

// Never throws: tracking must not break a request or a payment.
export async function sendServerEvent(event: ServerEvent): Promise<void> {
  const eventTime = Math.floor(Date.now() / 1000);
  await Promise.all([sendMeta(event, eventTime), sendTikTok(event, eventTime)]);
}
