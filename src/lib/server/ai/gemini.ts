import "server-only";
import { ContentBlockedError, type IllustrationRequest, type ImageProvider } from "./types";

// USD, from Google's Gemini API price list (checked 2026-10-10). Output is billed per image by
// size; reference images are billed as input tokens.
const PRICES: Record<string, { perImage: Record<"1K" | "2K", number>; inputPerMtok: number }> = {
  "gemini-nano-banana-2.1": { perImage: { "1K": 0.0336, "2K": 0.0504 }, inputPerMtok: 1.5 },
  "gemini-3.1-flash-image": { perImage: { "1K": 0.067, "2K": 0.101 }, inputPerMtok: 0.5 },
  "gemini-3-pro-image": { perImage: { "1K": 0.134, "2K": 0.134 }, inputPerMtok: 2 },
};

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

type ImageBlock = { type: "image"; data: string; mime_type?: string };

// The image sits in steps[].content[] (or output_image on some responses). Walking the tree keeps
// this working if the nesting moves.
export function findImage(node: unknown): ImageBlock | null {
  if (!node || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  if (obj.type === "image" && typeof obj.data === "string" && obj.data.length > 100) return obj as ImageBlock;
  for (const value of Object.values(obj)) {
    const found = Array.isArray(value) ? value.map(findImage).find(Boolean) : findImage(value);
    if (found) return found;
  }
  return null;
}

const blockedReason = (body: unknown): string | null => {
  const text = JSON.stringify(body ?? {}).toLowerCase();
  return /safety|blocked|prohibited|policy|image_safety|recitation/.test(text) ? text.slice(0, 300) : null;
};

export function geminiProvider(apiKey: string, model: string, size: "1K" | "2K"): ImageProvider {
  return {
    name: "gemini",
    model,
    async generate(request: IllustrationRequest) {
      const started = Date.now();
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          store: false,
          input: [
            { type: "text", text: request.prompt },
            ...request.references.map((ref) => ({ type: "image", mime_type: "image/jpeg", data: ref.toString("base64") })),
          ],
          response_format: { type: "image", aspect_ratio: request.aspect, image_size: size, mime_type: "image/jpeg" },
        }),
        signal: AbortSignal.timeout(120_000),
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const reason = blockedReason(body);
        if (res.status === 400 && reason) throw new ContentBlockedError(`gemini blocked: ${reason}`);
        throw new Error(`gemini ${res.status}: ${JSON.stringify(body).slice(0, 400)}`);
      }
      const image = findImage(body);
      if (!image) {
        const reason = blockedReason(body);
        if (reason) throw new ContentBlockedError(`gemini returned no image: ${reason}`);
        throw new Error(`gemini returned no image: ${JSON.stringify(body).slice(0, 400)}`);
      }
      const usage = (body as { usage?: { total_input_tokens?: number; total_output_tokens?: number } }).usage;
      const price = PRICES[model];
      const inputTokens = usage?.total_input_tokens ?? null;
      return {
        image: Buffer.from(image.data, "base64"),
        usage: {
          provider: "gemini",
          model,
          inputTokens,
          outputTokens: usage?.total_output_tokens ?? null,
          costUsd: price ? price.perImage[size] + ((inputTokens ?? 0) * price.inputPerMtok) / 1e6 : 0,
          latencyMs: Date.now() - started,
        },
      };
    },
  };
}
