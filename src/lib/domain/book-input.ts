import { z } from "zod";
import { containsBlockedTerm } from "./moderation";
import { THEME_IDS } from "./themes";

export const TRAITS = {
  curiosa: { label: "Curiosa", en: "curious", virtue: "curiosidade" },
  corajosa: { label: "Corajosa", en: "brave", virtue: "coragem" },
  divertida: { label: "Divertida", en: "funny and playful", virtue: "bom humor" },
  carinhosa: { label: "Carinhosa", en: "kind and caring", virtue: "carinho" },
  criativa: { label: "Criativa", en: "creative", virtue: "criatividade" },
  aventureira: { label: "Aventureira", en: "adventurous", virtue: "espírito aventureiro" },
} as const;
export type TraitId = keyof typeof TRAITS;
export const TRAIT_IDS = Object.keys(TRAITS) as [TraitId, ...TraitId[]];
export const MAX_TRAITS = 2;

// Portuguese grammar needs this; "neutro" writes around gendered words using the name.
export const PRONOUNS = {
  ele: { label: "Ele", en: "he" },
  ela: { label: "Ela", en: "she" },
  neutro: { label: "Prefiro usar só o nome", en: "use the child's name instead of gendered pronouns or adjectives" },
} as const;
export type Pronoun = keyof typeof PRONOUNS;

export const COMPANIONS = {
  irmao: { label: "Irmão ou irmã", en: "sibling" },
  amigo: { label: "Amigo ou amiga", en: "best friend" },
  pet: { label: "Pet", en: "pet" },
} as const;
export type CompanionKind = keyof typeof COMPANIONS;

export const PET_KINDS = {
  cachorro: { label: "Cachorro", en: "dog" },
  gato: { label: "Gato", en: "cat" },
  outro: { label: "Outro", en: "small pet" },
} as const;
export type PetKind = keyof typeof PET_KINDS;

export const MIN_AGE = 1;
export const MAX_AGE = 14;
// Ages shown as one-tap chips; older children go through "Outro".
export const AGE_CHIPS = Array.from({ length: 11 }, (_, i) => MIN_AGE + i);

const collapse = (value: string) => value.normalize("NFC").replace(/\s+/g, " ").trim();
// Letters from any language, combining marks, spaces, apostrophes and hyphens. No digits or symbols,
// so a name can never smuggle an instruction into a prompt.
const NAME = /^[\p{L}\p{M}][\p{L}\p{M}' -]*$/u;

const personName = (max: number) =>
  z
    .string()
    .transform(collapse)
    .pipe(
      z
        .string()
        .min(2, "Digite pelo menos 2 letras.")
        .max(max, `Use no máximo ${max} caracteres.`)
        .regex(NAME, "Use apenas letras.")
        .refine((v) => !containsBlockedTerm(v), "Escolha outro nome."),
    );

const optionalName = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? collapse(v) : ""))
    .pipe(z.union([z.literal(""), personName(max)]))
    .transform((v) => v || undefined);

export const Interests = z
  .string()
  .optional()
  .transform((v) => (v ? collapse(v) : ""))
  .pipe(
    z
      .string()
      .max(80, "Use no máximo 80 caracteres.")
      .regex(/^[\p{L}\p{M}\p{N} ,.;'&-]*$/u, "Use só palavras separadas por vírgula.")
      .refine((v) => !containsBlockedTerm(v), "Algumas palavras não podem entrar em um livro infantil."),
  )
  .transform((v) => v || undefined);

export const Companion = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("irmao"), name: personName(20) }),
  z.object({ kind: z.literal("amigo"), name: personName(20) }),
  z.object({
    kind: z.literal("pet"),
    name: personName(20),
    petKind: z.enum(Object.keys(PET_KINDS) as [PetKind, ...PetKind[]]).default("cachorro"),
  }),
]);
export type Companion = z.infer<typeof Companion>;

export const BookInput = z.object({
  childFirstName: personName(24),
  childNickname: optionalName(20),
  childAge: z.coerce.number().int().min(MIN_AGE, `Idade mínima: ${MIN_AGE} ano.`).max(MAX_AGE, `Idade máxima: ${MAX_AGE} anos.`),
  pronoun: z.enum(Object.keys(PRONOUNS) as [Pronoun, ...Pronoun[]]),
  theme: z.enum(THEME_IDS),
  interests: Interests,
  traits: z.array(z.enum(TRAIT_IDS)).min(1, "Escolha pelo menos uma.").max(MAX_TRAITS, "Escolha até duas."),
  companion: Companion,
});
export type BookInput = z.infer<typeof BookInput>;
// What the form holds before parsing.
export type BookInputDraft = z.input<typeof BookInput>;

export type AgeBand = "small" | "middle" | "big";
export const ageBand = (age: number): AgeBand => (age <= 5 ? "small" : age <= 8 ? "middle" : "big");

// Longest page text the PDF layout holds comfortably, per age band.
export const PAGE_TEXT_MAX: Record<AgeBand, number> = { small: 220, middle: 330, big: 430 };
