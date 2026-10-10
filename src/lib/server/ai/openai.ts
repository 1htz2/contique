import "server-only";
import { ContentBlockedError, type IllustrationRequest, type ImageProvider } from "./types";

// USD per million tokens for GPT Image models. Published rates vary by source; treat the resulting
// cost as an estimate and confirm on OpenAI's pricing page before relying on it.
const PRICES: Record<string, { textIn: number; imageIn: number; out: number }> = {
  "gpt-image-2": { textIn: 5, imageIn: 8, out: 30 },
  "gpt-image-1": { textIn: 5, imageIn: 10, out: 40 },
};

const SIZES = { "3:4": "1024x1536", "4:3": "1536x1024" } as const;

type OpenAIImageResponse = {
  data?: { b64_json?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { text_tokens?: number; image_tokens?: number } };
  error?: { code?: string; message?: string };
};

export function openaiProvider(apiKey: string, model: string): ImageProvider {
  return {
    name: "openai",
    model,
    async generate(request: IllustrationRequest) {
      const started = Date.now();
      const withRefs = request.references.length > 0;
      let res: Response;
      if (withRefs) {
        const form = new FormData();
        form.set("model", model);
        form.set("prompt", request.prompt);
        form.set("size", SIZES[request.aspect]);
        form.set("quality", "medium");
        request.references.forEach((ref, i) =>
          form.append("image[]", new Blob([new Uint8Array(ref)], { type: "image/jpeg" }), `ref-${i}.jpg`),
        );
        res = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}` },
          body: form,
          signal: AbortSignal.timeout(180_000),
        });
      } else {
        res = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model, prompt: request.prompt, size: SIZES[request.aspect], quality: "medium" }),
          signal: AbortSignal.timeout(180_000),
        });
      }
      const body = (await res.json().catch(() => ({}))) as OpenAIImageResponse;
      if (!res.ok) {
        if (body.error?.code === "moderation_blocked" || /safety|moderation/i.test(body.error?.message ?? "")) {
          throw new ContentBlockedError(`openai blocked: ${body.error?.message}`);
        }
        throw new Error(`openai ${res.status}: ${body.error?.message ?? "unknown error"}`);
      }
      const b64 = body.data?.[0]?.b64_json;
      if (!b64) throw new Error("openai returned no image");
      const price = PRICES[model];
      const details = body.usage?.input_tokens_details;
      const outputTokens = body.usage?.output_tokens ?? null;
      const cost = price
        ? ((details?.text_tokens ?? 0) * price.textIn + (details?.image_tokens ?? 0) * price.imageIn + (outputTokens ?? 0) * price.out) / 1e6
        : 0;
      return {
        image: Buffer.from(b64, "base64"),
        usage: {
          provider: "openai",
          model,
          inputTokens: body.usage?.input_tokens ?? null,
          outputTokens,
          costUsd: cost,
          latencyMs: Date.now() - started,
        },
      };
    },
  };
}
