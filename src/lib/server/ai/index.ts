import "server-only";
import sharp from "sharp";
import { env } from "../env";
import { db } from "../supabase";
import { anthropicProvider } from "./anthropic";
import { geminiProvider } from "./gemini";
import { lineArt, mockProvider } from "./mock";
import { openaiProvider } from "./openai";
import { templateProvider, templateStory } from "./template";
import { ContentBlockedError, type IllustrationRequest, type ImageProvider, type Operation, type StoryRequest, type TextProvider, type Usage } from "./types";

export { ContentBlockedError };
export type { Operation, Usage } from "./types";

let text: TextProvider | undefined;
let image: ImageProvider | undefined;

export function textProvider(): TextProvider {
  if (text) return text;
  const e = env();
  text =
    e.TEXT_AI_PROVIDER === "anthropic" && e.ANTHROPIC_API_KEY
      ? anthropicProvider(e.ANTHROPIC_API_KEY, e.STORY_MODEL, e.VISION_MODEL)
      : templateProvider;
  if (e.TEXT_AI_PROVIDER === "anthropic" && !e.ANTHROPIC_API_KEY) console.warn("ANTHROPIC_API_KEY missing: using template stories");
  return text;
}

export function imageProvider(): ImageProvider {
  if (image) return image;
  const e = env();
  if (e.IMAGE_AI_PROVIDER === "gemini" && e.GEMINI_API_KEY) image = geminiProvider(e.GEMINI_API_KEY, e.GEMINI_IMAGE_MODEL, e.IMAGE_SIZE);
  else if (e.IMAGE_AI_PROVIDER === "openai" && e.OPENAI_API_KEY) image = openaiProvider(e.OPENAI_API_KEY, e.OPENAI_IMAGE_MODEL);
  else {
    if (e.IMAGE_AI_PROVIDER !== "mock") console.warn(`${e.IMAGE_AI_PROVIDER} key missing: using mock illustrations`);
    image = mockProvider;
  }
  return image;
}

export async function recordUsage(bookId: string, operation: Operation, usage: Usage): Promise<void> {
  const { error } = await db().from("ai_usage").insert({
    book_id: bookId,
    provider: usage.provider,
    model: usage.model,
    operation,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    estimated_cost: Number(usage.costUsd.toFixed(6)),
    latency_ms: usage.latencyMs,
  });
  if (error) console.error("ai_usage insert failed", error.message);
}

export async function describeCharacter(bookId: string, photo: Buffer, input: StoryRequest) {
  const { reading, usage } = await textProvider().describeCharacter(photo, input);
  await recordUsage(bookId, "character", usage);
  return reading;
}

// A model failure must not cost the customer their book: after the provider's own retries, the
// template story keeps the preview alive. A schema miss (say, nine pages) gets one more try first.
const STORY_ATTEMPTS = 2;

export async function generateStory(bookId: string, input: StoryRequest) {
  for (let attempt = 1; attempt <= STORY_ATTEMPTS; attempt++) {
    try {
      const { story, usage } = await textProvider().generateStory(input);
      await recordUsage(bookId, "story", usage);
      return { story, source: textProvider().name };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`story generation attempt ${attempt} failed for ${bookId}`, message);
      if (error instanceof ContentBlockedError) break;
    }
  }
  return { story: templateStory(input), source: "template" };
}

const OUTPUT = { "3:4": { width: 1200, height: 1600 }, "4:3": { width: 1600, height: 1200 } } as const;

// Normalizes every provider's output: exact aspect, JPEG for illustrations, PNG line art for coloring.
export async function generateIllustration(bookId: string, request: IllustrationRequest): Promise<Buffer> {
  const { image: raw, usage } = await imageProvider().generate(request);
  await recordUsage(bookId, request.operation, usage);
  const { width, height } = OUTPUT[request.aspect];
  const fitted = sharp(raw).rotate().resize({ width, height, fit: "cover", withoutEnlargement: false });
  if (request.operation === "coloring") {
    return fitted.greyscale().threshold(170).png({ palette: true, colours: 2 }).toBuffer();
  }
  return fitted.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

export { lineArt };
