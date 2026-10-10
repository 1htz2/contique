import type { BookInput } from "@/lib/domain/book-input";
import type { Story } from "@/lib/domain/book";
import type { CharacterReading } from "./character";

export type Operation = "character" | "story" | "cover" | "page" | "coloring";

export type Usage = {
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number;
  latencyMs: number;
};

export type StoryRequest = BookInput & { language: "pt-BR" };

export interface TextProvider {
  readonly name: string;
  describeCharacter(photo: Buffer, input: StoryRequest): Promise<{ reading: CharacterReading; usage: Usage }>;
  generateStory(input: StoryRequest): Promise<{ story: Story; usage: Usage }>;
}

export type Aspect = "3:4" | "4:3";

export type IllustrationRequest = {
  operation: Exclude<Operation, "character" | "story">;
  prompt: string;
  aspect: Aspect;
  // Reference images, most important first: the child's photo for the cover, the illustrated
  // cover for every page, the colored page for its line-art version.
  references: Buffer[];
  // Used only by the mock provider to draw a placeholder that still looks like the right book.
  hint: { theme: string; label: string };
};

export interface ImageProvider {
  readonly name: string;
  readonly model: string;
  generate(request: IllustrationRequest): Promise<{ image: Buffer; usage: Usage }>;
}

// Raised when a provider declines a request on safety grounds. The pipeline reacts differently to
// this than to an outage: it retries the cover without the photo, and never retries the same prompt.
export class ContentBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentBlockedError";
  }
}
