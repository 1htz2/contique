import { z } from "zod";
import { PET_KINDS, PRONOUNS, type BookInput } from "@/lib/domain/book-input";
import { PHOTO_PROBLEMS, type PhotoProblem } from "@/lib/domain/book";
import { themeOf, type Outfit } from "@/lib/domain/themes";

const PROBLEM_IDS = Object.keys(PHOTO_PROBLEMS) as [PhotoProblem, ...PhotoProblem[]];

// What the vision model may return. Only visual attributes an illustrator needs: there is no field
// where race, ethnicity, health, religion, personality or identity could go.
export const CharacterReading = z.object({
  usable: z.boolean(),
  problem: z.enum(["none", ...PROBLEM_IDS]),
  hair_color: z.string().max(60),
  hair_texture: z.enum(["straight", "wavy", "curly", "coily", "not visible"]),
  hair_length: z.enum(["bald or shaved", "very short", "short", "chin length", "shoulder length", "long", "not visible"]),
  hair_style: z.string().max(80),
  eye_color: z.string().max(40),
  skin_tone: z.string().max(60),
  face_shape: z.string().max(40),
  glasses: z.boolean(),
  distinctive_details: z.array(z.string().max(60)).max(4),
});
export type CharacterReading = z.infer<typeof CharacterReading>;

export type CharacterSheet = {
  version: 1;
  reading: CharacterReading;
  outfit: Outfit;
  // Fixed English description repeated in every illustration prompt.
  descriptor: string;
};

const clean = (text: string) => text.replace(/[^\p{L}\p{N} ,.'-]/gu, "").trim();

// Stable per book, so a regenerated page keeps the same clothes.
function pickOutfit(themeId: string, seed: string): Outfit {
  const outfits = themeOf(themeId).outfits;
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return outfits[hash % outfits.length];
}

export function buildCharacter(reading: CharacterReading, input: BookInput, seed: string): CharacterSheet {
  const outfit = pickOutfit(input.theme, seed);
  const hair = [
    reading.hair_length !== "not visible" ? reading.hair_length : null,
    reading.hair_texture !== "not visible" ? reading.hair_texture : null,
    clean(reading.hair_color),
    "hair",
  ]
    .filter(Boolean)
    .join(" ");
  const parts = [
    `${input.childAge}-year-old illustrated child named ${input.childFirstName}`,
    `${hair}${reading.hair_style ? ` styled as ${clean(reading.hair_style)}` : ""}`,
    `${clean(reading.eye_color)} eyes`,
    `${clean(reading.skin_tone)} skin tone`,
    `${clean(reading.face_shape)} face`,
    reading.glasses ? "wears glasses" : null,
    ...reading.distinctive_details.map(clean),
    `wearing ${outfit.en}`,
  ];
  return { version: 1, reading, outfit, descriptor: parts.filter(Boolean).join(", ") };
}

export function companionDescriptor(input: BookInput, companionLook: string | null): string | null {
  const c = input.companion;
  if (c.kind === "none") return null;
  if (c.kind === "pet") {
    const kind = PET_KINDS[c.petKind].en;
    return `${c.name}, the child's ${kind}${companionLook ? `: ${companionLook}` : ""}`;
  }
  const role = c.kind === "irmao" ? "sibling" : "best friend";
  return `${c.name}, the child's ${role}${companionLook ? `: ${companionLook}` : ""}`;
}

export const pronounNote = (input: BookInput) => PRONOUNS[input.pronoun].en;
