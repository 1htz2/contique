import "server-only";
import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

const reais = (fallback: number) =>
  z.coerce
    .number()
    .positive()
    .default(fallback)
    .transform((v) => Math.round(v * 100) / 100);

const schema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  // Optional at boot so the preview runs without payment setup; requireEnv fails loudly the
  // moment a payment path needs one.
  MERCADOPAGO_ACCESS_TOKEN: optional,
  MERCADOPAGO_WEBHOOK_SECRET: optional,
  BOOK_PRICE_BRL: reais(14.9),
  COLORING_BOOK_PRICE_BRL: reais(6.9),

  TEXT_AI_PROVIDER: z.enum(["anthropic", "template"]).default("anthropic"),
  IMAGE_AI_PROVIDER: z.enum(["gemini", "openai", "mock"]).default("gemini"),
  ANTHROPIC_API_KEY: optional,
  STORY_MODEL: z.string().min(1).default("claude-opus-5-5"),
  VISION_MODEL: z.string().min(1).default("claude-opus-5-5"),
  GEMINI_API_KEY: optional,
  GEMINI_IMAGE_MODEL: z.string().min(1).default("gemini-nano-banana-2.1"),
  OPENAI_API_KEY: optional,
  OPENAI_IMAGE_MODEL: z.string().min(1).default("gpt-image-2"),
  // 1K is ~1024 px on the long side, enough for an A4 home print at ~150 dpi.
  IMAGE_SIZE: z.enum(["1K", "2K"]).default("1K"),
  IMAGE_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(4),

  // Hard ceiling on previews per day, the only spend that does not come with a sale.
  MAX_PREVIEWS_PER_DAY: z.coerce.number().int().positive().default(800),
  // Generated books stay downloadable this long, then their files are deleted.
  BOOK_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),
  USD_BRL_RATE: z.coerce.number().positive().default(5.4),

  CRON_SECRET: optional,
  META_PIXEL_ID: optional,
  META_CAPI_ACCESS_TOKEN: optional,
  META_TEST_EVENT_CODE: optional,
  TIKTOK_PIXEL_ID: optional,
  TIKTOK_EVENTS_ACCESS_TOKEN: optional,
  TIKTOK_TEST_EVENT_CODE: optional,
});

export type Env = z.infer<typeof schema>;
let cached: Env | undefined;

export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}

export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = env()[key];
  if (value === undefined || value === null || value === "") throw new Error(`${String(key)} is not configured`);
  return value as NonNullable<Env[K]>;
}

export type Product = "book" | "coloring";
export const priceOf = (product: Product) =>
  product === "book" ? env().BOOK_PRICE_BRL : env().COLORING_BOOK_PRICE_BRL;
