import { getVisitorId } from "@/lib/attribution";
import { SITE_NAME } from "@/lib/site";
import { STANDARD_EVENT, TIKTOK_EVENT, type EventName, type EventPayload } from "./events";

type Properties = NonNullable<EventPayload["properties"]>;
type TrackOptions = { eventId?: string; token?: string };

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    ttq?: { track: (...args: unknown[]) => void; page: () => void };
    gtag?: (...args: unknown[]) => void;
  }
}

function send(payload: EventPayload) {
  const body = JSON.stringify(payload);
  try {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/events", blob)) return;
  } catch {}
  fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

// Only standard events go to ad platforms; internal funnel events stay in our own database.
function forwardToPixels(name: EventName, properties: Properties, eventId: string) {
  const standard = STANDARD_EVENT[name];
  if (!standard) return;
  const params =
    standard === "Purchase"
      ? { value: properties.value, currency: "BRL", content_name: SITE_NAME }
      : properties;

  try {
    // The Meta base snippet already fires PageView on load, so landing_view must not repeat it.
    if (window.fbq && standard !== "PageView") window.fbq("track", standard, params, { eventID: eventId });
    const tiktok = TIKTOK_EVENT[standard];
    if (window.ttq && tiktok) window.ttq.track(tiktok, params, { event_id: eventId });
    window.gtag?.("event", name, params);
  } catch {}
}

export function trackEvent(name: EventName, properties: Properties = {}, opts: TrackOptions = {}) {
  const eventId = opts.eventId ?? crypto.randomUUID();
  send({ name, eventId, visitorId: getVisitorId(), token: opts.token, properties });
  forwardToPixels(name, properties, eventId);
}
