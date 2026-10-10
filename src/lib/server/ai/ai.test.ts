import { describe, expect, it, vi } from "vitest";
import { Story, PAGE_COUNT } from "@/lib/domain/book";
import { BookInput, PAGE_TEXT_MAX, ageBand, type Companion } from "@/lib/domain/book-input";
import { THEME_IDS } from "@/lib/domain/themes";

vi.mock("server-only", () => ({}));
const { templateStory } = await import("./template");
const { buildCharacter, CharacterReading } = await import("./character");
const { findImage } = await import("./gemini");

const companions: Companion[] = [
  { kind: "none" },
  { kind: "irmao", name: "Bia" },
  { kind: "pet", name: "Bolinha", petKind: "cachorro" },
];

describe("templateStory", () => {
  it("produces a valid 10-page story for every theme, companion and age", () => {
    for (const theme of THEME_IDS) {
      for (const companion of companions) {
        for (const childAge of [3, 7, 10]) {
          const input = BookInput.parse({
            childFirstName: "Maria Eduarda Valentina",
            childAge,
            pronoun: "neutro",
            theme,
            interests: "futebol, astronomia",
            traits: ["criativa"],
            companion,
          });
          const story = Story.parse(templateStory(input));
          expect(story.pages).toHaveLength(PAGE_COUNT);
          expect(story.title.startsWith("Maria Eduarda Valentina")).toBe(true);
          for (const page of story.pages) {
            expect(page.text.length, `${theme} p${page.page}`).toBeLessThanOrEqual(PAGE_TEXT_MAX.big);
          }
        }
      }
    }
  });

  it("conjugates for one child or two characters", () => {
    const solo = templateStory(BookInput.parse({ childFirstName: "Lucas", childAge: 6, pronoun: "ele", theme: "espaco", traits: ["curiosa"], companion: { kind: "none" } }));
    expect(solo.pages[1].text).toContain("Lucas encontrou");
    const pair = templateStory(
      BookInput.parse({ childFirstName: "Lucas", childAge: 6, pronoun: "ele", theme: "espaco", traits: ["curiosa"], companion: { kind: "amigo", name: "Theo" } }),
    );
    expect(pair.pages[1].text).toContain("Lucas e Theo encontraram");
  });
});

describe("buildCharacter", () => {
  const reading = CharacterReading.parse({
    usable: true,
    problem: "none",
    hair_color: "dark brown",
    hair_texture: "curly",
    hair_length: "short",
    hair_style: "messy curls",
    eye_color: "warm brown",
    skin_tone: "golden tan",
    face_shape: "round",
    glasses: true,
    distinctive_details: ["freckles", "<b>dimples</b>"],
  });
  const input = BookInput.parse({ childFirstName: "Lucas", childAge: 7, pronoun: "ele", theme: "dinossauros", traits: ["corajosa"], companion: { kind: "none" } });

  it("builds a fixed descriptor with the outfit and only visual attributes", () => {
    const sheet = buildCharacter(reading, input, "book-1");
    expect(sheet.descriptor).toContain("7-year-old illustrated child named Lucas");
    expect(sheet.descriptor).toContain("short curly dark brown hair");
    expect(sheet.descriptor).toContain("wears glasses");
    expect(sheet.descriptor).toContain(`wearing ${sheet.outfit.en}`);
    expect(sheet.descriptor).not.toMatch(/[<>]/);
  });

  it("keeps the same outfit for the same book", () => {
    expect(buildCharacter(reading, input, "book-1").outfit).toEqual(buildCharacter(reading, input, "book-1").outfit);
  });

  it("has no field where race or ethnicity could be stored", () => {
    expect(Object.keys(CharacterReading.shape).join(" ")).not.toMatch(/race|ethnic|origin|religion|health/);
  });
});

describe("findImage", () => {
  const data = "A".repeat(200);
  it("finds the image inside interaction steps", () => {
    const body = { steps: [{ type: "thought" }, { type: "model_output", content: [{ type: "text", text: "ok" }, { type: "image", data, mime_type: "image/jpeg" }] }] };
    expect(findImage(body)?.data).toBe(data);
  });
  it("finds a top-level output image", () => {
    expect(findImage({ output_image: { type: "image", data } })?.data).toBe(data);
  });
  it("returns null without an image", () => {
    expect(findImage({ steps: [{ type: "model_output", content: [{ type: "text", text: "no" }] }] })).toBeNull();
  });
});

describe("ageBand", () => {
  it("splits ages into the three reading levels", () => {
    expect([3, 5, 6, 8, 9, 11].map(ageBand)).toEqual(["small", "small", "middle", "middle", "big", "big"]);
  });
});
