import { describe, expect, it } from "vitest";
import { BookInput, type BookInputDraft } from "./book-input";
import { containsBlockedTerm } from "./moderation";

const base: BookInputDraft = {
  childFirstName: "Lucas",
  childAge: 6,
  pronoun: "ele",
  theme: "dinossauros",
  traits: ["curiosa"],
  companion: { kind: "none" },
};

const parse = (change: Partial<BookInputDraft>) => BookInput.safeParse({ ...base, ...change });

describe("BookInput", () => {
  it("accepts names with accents, apostrophes, hyphens and two words", () => {
    for (const name of ["João", "Ana-Lívia", "D'Ávila", "Maria Clara", "Ñandú", "Zoë"]) {
      expect(parse({ childFirstName: name }).success, name).toBe(true);
    }
  });

  it("normalizes spacing in names", () => {
    const result = parse({ childFirstName: "  Maria    Clara " });
    expect(result.success && result.data.childFirstName).toBe("Maria Clara");
  });

  it("rejects names that could smuggle instructions or symbols", () => {
    for (const name of ["Lucas123", "<script>", "Ignore {all}", "Lu\"cas", "A", "😀😀"]) {
      expect(parse({ childFirstName: name }).success, name).toBe(false);
    }
  });

  it("rejects names longer than 24 characters", () => {
    expect(parse({ childFirstName: "Maria Eduarda Valentina Sofia" }).success).toBe(false);
    expect(parse({ childFirstName: "Maria Eduarda Valentina" }).success).toBe(true);
  });

  it("limits traits to one or two", () => {
    expect(parse({ traits: [] }).success).toBe(false);
    expect(parse({ traits: ["curiosa", "corajosa"] }).success).toBe(true);
    expect(parse({ traits: ["curiosa", "corajosa", "divertida"] }).success).toBe(false);
  });

  it("accepts only themes from the registry", () => {
    expect(parse({ theme: "espaco" }).success).toBe(true);
    expect(parse({ theme: "terror" as never }).success).toBe(false);
  });

  it("requires a name for a companion and keeps only the name", () => {
    expect(parse({ companion: { kind: "pet", name: "" } as never }).success).toBe(false);
    const result = parse({ companion: { kind: "pet", name: "Bolinha", petKind: "gato" } });
    expect(result.success && result.data.companion).toEqual({ kind: "pet", name: "Bolinha", petKind: "gato" });
  });

  it("blocks inappropriate interests but keeps ordinary ones", () => {
    expect(parse({ interests: "dinossauros, futebol, astronomia" }).success).toBe(true);
    expect(parse({ interests: "armas e sangue" }).success).toBe(false);
  });

  it("keeps ages within the supported range", () => {
    expect(parse({ childAge: 1 }).success).toBe(false);
    expect(parse({ childAge: 12 }).success).toBe(false);
    expect(parse({ childAge: "8" as never }).success).toBe(true);
  });
});

describe("containsBlockedTerm", () => {
  it("matches whole words regardless of accents and case", () => {
    expect(containsBlockedTerm("Gosta de ARMAS")).toBe(true);
    expect(containsBlockedTerm("morte")).toBe(true);
    expect(containsBlockedTerm("cocaína")).toBe(true);
  });

  it("does not flag words that merely contain a blocked one", () => {
    expect(containsBlockedTerm("nuvem, nutella, numeros")).toBe(false);
    expect(containsBlockedTerm("armário, cachorro, guerreiro")).toBe(false);
    expect(containsBlockedTerm("polvo, lula e macaco")).toBe(false);
  });
});
