import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { Story } from "@/lib/domain/book";
import { CharacterReading } from "./character";
import { CHARACTER_SYSTEM, STORY_SYSTEM, storyUserMessage } from "./prompts";
import { ContentBlockedError, type TextProvider, type Usage } from "./types";

// USD per million tokens, from Anthropic's published price list (checked 2026-10-10).
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

// The fallback chain is routed by Anthropic per refusal category. The model is declared in the
// request, so a fallback answer still comes back in the same schema.
const FALLBACK: Pick<Anthropic.Beta.MessageCreateParamsNonStreaming, "betas" | "fallbacks"> = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};
const supportsFallback = (model: string) => /^claude-(opus-5|sonnet-5-5|fable)/.test(model);

function usageOf(model: string, started: number, usage: { input_tokens: number; output_tokens: number }): Usage {
  const price = PRICE_PER_MTOK[model];
  return {
    provider: "anthropic",
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    costUsd: price ? (usage.input_tokens * price.input + usage.output_tokens * price.output) / 1e6 : 0,
    latencyMs: Date.now() - started,
  };
}

export function anthropicProvider(apiKey: string, storyModel: string, visionModel: string): TextProvider {
  const client = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 2 });

  async function parse<T>(
    model: string,
    params: Omit<Anthropic.Beta.MessageCreateParamsNonStreaming, "model" | "max_tokens" | "output_config">,
    format: ReturnType<typeof betaZodOutputFormat<import("zod").ZodType<T>>>,
    maxTokens: number,
  ) {
    const started = Date.now();
    const response = await client.beta.messages.parse({
      ...params,
      model,
      max_tokens: maxTokens,
      // Short, constrained creative work: low effort keeps thinking (and cost) small.
      output_config: { effort: "low", format },
      ...(supportsFallback(model) ? FALLBACK : {}),
    });
    if (response.stop_reason === "refusal") throw new ContentBlockedError(`${model} declined the request`);
    if (response.stop_reason === "max_tokens") throw new Error(`${model} hit max_tokens`);
    const parsed = response.parsed_output;
    if (!parsed) throw new Error(`${model} output did not parse (stop_reason ${response.stop_reason})`);
    return { parsed: parsed as T, usage: usageOf(response.model ?? model, started, response.usage) };
  }

  return {
    name: "anthropic",

    async describeCharacter(photo) {
      const { parsed, usage } = await parse(
        visionModel,
        {
          system: CHARACTER_SYSTEM,
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: "image/jpeg", data: photo.toString("base64") } },
                { type: "text", text: "Describe this child for the illustrator." },
              ],
            },
          ],
        },
        betaZodOutputFormat(CharacterReading),
        4000,
      );
      return { reading: parsed, usage };
    },

    async generateStory(input) {
      const { parsed, usage } = await parse(
        storyModel,
        {
          system: [{ type: "text", text: STORY_SYSTEM, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: storyUserMessage(input) }],
        },
        betaZodOutputFormat(Story),
        16000,
      );
      return { story: parsed, usage };
    },
  };
}
