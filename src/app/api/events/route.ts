import { after } from "next/server";
import { z } from "zod";
import { EVENTS, STANDARD_EVENT } from "@/lib/analytics/events";
import { eventSourceUrl, sendServerEvent, sha256 } from "@/lib/analytics/server";
import { rateLimit } from "@/lib/server/rate-limit";
import { apiError, clientIp, cookie, readJson, userAgent } from "@/lib/server/request";
import { isBookToken } from "@/lib/server/books";
import { db } from "@/lib/server/supabase";

const Body = z.object({
  name: z.enum(EVENTS),
  eventId: z.string().trim().min(1).max(100),
  visitorId: z.string().trim().min(1).max(100),
  token: z.string().optional(),
  properties: z
    .record(z.string().max(40), z.union([z.string().max(200), z.number().finite(), z.boolean()]))
    .refine((p) => Object.keys(p).length <= 20)
    .optional(),
});

export async function POST(req: Request) {
  if (!(await rateLimit(req, "events"))) return apiError("rate_limited", 429);
  const body = Body.safeParse(await readJson(req));
  if (!body.success) return apiError("invalid_request", 400);
  const { name, eventId, visitorId, token, properties } = body.data;

  const { data: book } =
    token && isBookToken(token)
      ? await db().from("books").select("id, fbc, fbclid, ttclid, created_at").eq("token", token).maybeSingle()
      : { data: null };

  // Stored even for payment_approved, but the admin funnel counts sales from payments only.
  const { error } = await db()
    .from("events")
    .upsert(
      {
        book_id: book?.id ?? null,
        visitor_id: visitorId,
        event_name: name,
        event_id: eventId,
        properties: properties ?? {},
      },
      { onConflict: "event_name,event_id", ignoreDuplicates: true },
    );
  if (error) console.error("events insert failed", error.message);

  const standard = STANDARD_EVENT[name];
  // Purchase is sent only by the payment path, once, after MP confirms it. PageView comes from the
  // pixel's own base snippet, which carries no event id we could dedupe a server copy against.
  if (standard && standard !== "Purchase" && standard !== "PageView") {
    const fbclid = book?.fbclid;
    const user = {
      ip: clientIp(req),
      ua: userAgent(req),
      fbp: cookie(req, "_fbp"),
      fbc:
        cookie(req, "_fbc") ??
        book?.fbc ??
        (fbclid ? `fb.1.${Date.parse(book.created_at)}.${fbclid}` : undefined),
      ttclid: cookie(req, "ttclid") ?? book?.ttclid,
      externalId: sha256(visitorId),
    };
    const url = eventSourceUrl(req.headers.get("referer"));
    after(() => sendServerEvent({ name: standard, eventId, eventSourceUrl: url, user }));
  }

  return new Response(null, { status: 204 });
}
