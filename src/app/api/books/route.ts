import { after } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { BookInput } from "@/lib/domain/book-input";
import { ATTRIBUTION_KEYS, type CreateBookResponse } from "@/lib/contracts";
import { books, newBookToken } from "@/lib/server/books";
import { env } from "@/lib/server/env";
import { advanceBook } from "@/lib/server/pipeline";
import { rateLimit, rateLimitKey } from "@/lib/server/rate-limit";
import { apiError, clientIp, json, userAgent } from "@/lib/server/request";
import { BUCKETS, paths, putFile } from "@/lib/server/storage";

// The preview (character, story, cover) runs in after() on this invocation.
export const maxDuration = 300;

const MAX_BYTES = 5 * 1024 * 1024;
const MIN_BYTES = 10 * 1024;
const MIN_SIDE = 320;

// Bad attribution must never cost a book, so malformed values become undefined.
const attributionValue = z
  .string()
  .transform((v) => v.trim().slice(0, 300) || undefined)
  .optional()
  .catch(undefined);
const attributionKeys = [...ATTRIBUTION_KEYS, "fbp", "fbc", "landing_path"] as const;

const Payload = z.object({
  visitorId: z.string().trim().min(1).max(100),
  consent: z.literal(true),
  attribution: z
    .object(
      Object.fromEntries(attributionKeys.map((k) => [k, attributionValue])) as Record<
        (typeof attributionKeys)[number],
        typeof attributionValue
      >,
    )
    .catch({} as Record<(typeof attributionKeys)[number], undefined>),
  input: BookInput,
});

const isJpeg = (buf: Buffer) => buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

// Decodes the upload for real (a renamed file or a polyglot fails here), checks its size, and
// re-encodes it. Re-encoding drops every metadata block, including EXIF GPS coordinates.
async function normalizePhoto(raw: Buffer): Promise<Buffer | null> {
  try {
    const image = sharp(raw, { failOn: "error", limitInputPixels: 40_000_000 });
    const meta = await image.metadata();
    if (meta.format !== "jpeg" || !meta.width || !meta.height) return null;
    if (Math.min(meta.width, meta.height) < MIN_SIDE) return null;
    return await image.rotate().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  } catch {
    return null;
  }
}

async function previewsToday(): Promise<number> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const { count, error } = await books()
    .select("id", { count: "exact", head: true })
    .gte("created_at", new Date(`${today}T00:00:00-03:00`).toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function POST(req: Request) {
  if (!(await rateLimit(req, "createBook"))) return apiError("rate_limited", 429);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError("invalid_request", 400);
  }
  const photo = form.get("photo");
  const rawPayload = form.get("payload");
  if (!(photo instanceof Blob) || typeof rawPayload !== "string") return apiError("invalid_request", 400);
  if (photo.size < MIN_BYTES || photo.size > MAX_BYTES) return apiError("invalid_photo", 400);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawPayload);
  } catch {
    return apiError("invalid_request", 400);
  }
  const payload = Payload.safeParse(parsedJson);
  if (!payload.success) return apiError("invalid_input", 400);
  const { visitorId, attribution, input } = payload.data;
  if (!(await rateLimitKey(visitorId, "createBookVisitor"))) return apiError("rate_limited", 429);

  const raw = Buffer.from(await photo.arrayBuffer());
  const jpeg = isJpeg(raw) ? await normalizePhoto(raw) : null;
  if (!jpeg) return apiError("invalid_photo", 400);

  if ((await previewsToday()) >= env().MAX_PREVIEWS_PER_DAY) {
    console.error("MAX_PREVIEWS_PER_DAY reached");
    return apiError("busy", 503);
  }

  const id = crypto.randomUUID();
  const token = newBookToken();
  const photoPath = paths.photo(id);
  await putFile(BUCKETS.uploads, photoPath, jpeg, "image/jpeg");

  const { error } = await books().insert({
    id,
    token,
    visitor_id: visitorId,
    consent_at: new Date().toISOString(),
    child_first_name: input.childFirstName,
    child_nickname: input.childNickname ?? null,
    child_age: input.childAge,
    child_pronoun: input.pronoun,
    theme: input.theme,
    interests: input.interests ?? null,
    traits: input.traits,
    companion_json: input.companion,
    photo_path: photoPath,
    ...attribution,
    client_ip: clientIp(req),
    client_user_agent: userAgent(req),
  });
  if (error) {
    console.error("book insert failed", error.message);
    return apiError("internal_error", 500);
  }

  after(() => advanceBook(id));
  return json<CreateBookResponse>({ token }, 201);
}
