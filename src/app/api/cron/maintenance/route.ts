import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/server/env";
import { applyRetention, purgeOldPhotos, resumeStalled } from "@/lib/server/maintenance";

export const maxDuration = 300;

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without a configured secret the route is closed.
function authorized(header: string | null): boolean {
  const secret = env().CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export async function GET(req: Request) {
  if (!authorized(req.headers.get("authorization"))) return new Response(null, { status: 401 });
  const deadline = Date.now() + 200_000;
  const photos = await purgeOldPhotos();
  const retention = await applyRetention();
  const resumed = await resumeStalled(deadline);
  return Response.json({ photos, retention, resumed });
}
