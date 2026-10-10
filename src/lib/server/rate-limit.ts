import "server-only";
import { clientIp } from "./request";
import { db } from "./supabase";

export const LIMITS = {
  // Each book costs a preview. Mobile carriers put many people behind one IP (CGNAT), so the IP
  // limit is loose and the per-visitor limit is the tight one; MAX_PREVIEWS_PER_DAY caps the total.
  createBook: { windowSeconds: 3600, max: 20 },
  createBookVisitor: { windowSeconds: 3600, max: 5 },
  bookStatus: { windowSeconds: 60, max: 90 },
  deleteData: { windowSeconds: 600, max: 10 },
  download: { windowSeconds: 600, max: 30 },
  checkoutPix: { windowSeconds: 600, max: 10 },
  checkoutCard: { windowSeconds: 600, max: 5 },
  paymentStatus: { windowSeconds: 60, max: 60 },
  events: { windowSeconds: 60, max: 120 },
} as const;

// Fails open: a database hiccup must not block a sale.
export function rateLimit(req: Request, route: keyof typeof LIMITS): Promise<boolean> {
  return rateLimitKey(clientIp(req) ?? "unknown", route);
}

export async function rateLimitKey(key: string, route: keyof typeof LIMITS): Promise<boolean> {
  const { windowSeconds, max } = LIMITS[route];
  const { data, error } = await db().rpc("rate_limit_hit", {
    p_key: `${route}:${key.slice(0, 120)}`,
    p_window_seconds: windowSeconds,
    p_max: max,
  });
  if (error) {
    console.error("rate_limit_hit failed", error.message);
    return true;
  }
  return data === true;
}
