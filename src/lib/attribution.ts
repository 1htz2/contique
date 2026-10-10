import { ATTRIBUTION_KEYS, type Attribution } from "@/lib/contracts";

const ATTRIBUTION_STORAGE_KEY = "cq.attribution.v1";
const VISITOR_STORAGE_KEY = "cq.visitor.v1";

// In-app browsers (Instagram, TikTok) can throw on any storage access.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

let memoVisitorId: string | undefined;

export function getVisitorId(): string {
  memoVisitorId ??= read(VISITOR_STORAGE_KEY) ?? crypto.randomUUID();
  write(VISITOR_STORAGE_KEY, memoVisitorId);
  return memoVisitorId;
}

let memoAttribution: Attribution = {};

// Last paid touch wins: a URL carrying any attribution key replaces what was stored.
export function captureAttribution() {
  const params = new URLSearchParams(window.location.search);
  const touch: Attribution = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = params.get(key);
    if (value) touch[key] = value.slice(0, 200);
  }
  if (Object.keys(touch).length === 0) return;
  touch.landing_path = window.location.pathname;
  if (touch.fbclid) {
    touch.fbc = `fb.1.${Date.now()}.${touch.fbclid}`;
    writeCookie("_fbc", touch.fbc);
  }
  if (touch.ttclid) writeCookie("ttclid", touch.ttclid);
  memoAttribution = touch;
  write(ATTRIBUTION_STORAGE_KEY, JSON.stringify(touch));
}

function storedAttribution(): Attribution {
  const raw = read(ATTRIBUTION_STORAGE_KEY);
  if (!raw) return memoAttribution;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return memoAttribution;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => typeof v === "string"),
    ) as Attribution;
  } catch {
    return memoAttribution;
  }
}

const COOKIE_MAX_AGE_S = 90 * 24 * 60 * 60;

// The server reads these on every event so CAPI and the Events API can match the ad click.
function writeCookie(name: string, value: string) {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${COOKIE_MAX_AGE_S}; path=/; SameSite=Lax`;
  } catch {}
}

function readCookie(name: string): string | undefined {
  try {
    const value = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${name}=`))
      ?.slice(name.length + 1);
    return value && decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

export function getAttribution(): Attribution {
  const attribution = { ...storedAttribution() };
  const fbp = readCookie("_fbp");
  const fbc = readCookie("_fbc");
  if (fbp) attribution.fbp = fbp;
  if (fbc) attribution.fbc = fbc;
  return attribution;
}
