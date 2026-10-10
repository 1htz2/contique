import "server-only";
import { PET_KINDS, TRAITS, type BookInput } from "@/lib/domain/book-input";
import type { Story } from "@/lib/domain/book";
import { themeOf } from "@/lib/domain/themes";
import type { CharacterReading } from "./character";
import type { TextProvider, Usage } from "./types";

const free = (): Usage => ({ provider: "template", model: "template", inputTokens: null, outputTokens: null, costUsd: 0, latencyMs: 0 });

// Without vision there is nothing to read from the photo. The image provider still receives the
// photo as a reference for the cover, so the drawn child follows the photo, not these words.
const NEUTRAL_READING: CharacterReading = {
  usable: true,
  problem: "none",
  hair_color: "as in the reference photo",
  hair_texture: "not visible",
  hair_length: "not visible",
  hair_style: "",
  eye_color: "as in the reference photo",
  skin_tone: "as in the reference photo",
  face_shape: "round",
  glasses: false,
  distinctive_details: [],
};

// Written around the child's name so it reads well whatever the pronoun choice.
export function templateStory(input: BookInput): Story {
  const name = input.childFirstName;
  const t = themeOf(input.theme);
  const s = t.slots;
  const virtue = TRAITS[input.traits[0]].virtue;
  const c = input.companion;
  const buddy = c.kind === "none" ? null : c.name;
  const withBuddy = buddy ? ` e ${buddy}` : "";
  const verb = (singular: string, plural: string) => (buddy ? plural : singular);
  const likes = input.interests ? ` ${name} adora ${input.interests.split(",")[0].trim().toLowerCase()} e` : "";
  const buddyLook =
    c.kind === "pet" ? `a small friendly ${PET_KINDS[c.petKind].en}` : c.kind === "none" ? null : "a cheerful child in a green t-shirt";

  const pages: [string, string][] = [
    [
      `Esta é a história de ${name}.${likes} sempre que pode, imagina aventuras incríveis antes de dormir.`,
      "The child at home in a cozy bedroom full of toys, smiling and daydreaming, warm afternoon light.",
    ],
    [
      `Numa tarde tranquila, ${name}${withBuddy} ${verb("encontrou", "encontraram")} ${s.portal}. Quando ${verb("chegou", "chegaram")} perto, tudo começou a brilhar!`,
      `The child discovering ${s.portal.replace(/^um[a]? /, "a ")}, glowing softly, eyes wide with wonder.`,
    ],
    [
      `Num piscar de olhos, ${name}${withBuddy} ${verb("estava", "estavam")} em ${s.place}. Que lugar mais lindo!`,
      "The child arriving in the magical setting, looking around amazed, wide establishing shot.",
    ],
    [
      `Logo no caminho apareceu ${s.obstacle}. ${name} respirou fundo e pensou com calma no melhor jeito de passar.`,
      `The child carefully thinking in front of an obstacle: ${s.obstacle}, gentle and not scary.`,
    ],
    [
      `Do outro lado, ${name} descobriu um segredo: ${s.problem}. Alguém precisava ajudar!`,
      "The child noticing a gentle problem in the magical world, concerned but hopeful expression.",
    ],
    [
      `Foi então que surgiu ${s.friend}. "Você veio nos ajudar?", perguntou, com um sorriso enorme.`,
      `The child meeting ${t.slots.friendEn}, both smiling, first friendly encounter.`,
    ],
    [
      `Juntos, partiram em busca de ${s.treasure}. O caminho era comprido, mas ninguém pensou em desistir.`,
      `The child and ${t.slots.friendEn} on a journey across the magical setting, determined and cheerful.`,
    ],
    [
      `Quando tudo parecia difícil, ${name} usou ${virtue} e encontrou uma ideia que ninguém tinha pensado antes.`,
      "The child having a bright idea, a soft glow of inspiration, friends watching hopefully.",
    ],
    [
      `Deu certo! Tudo voltou a ficar bem, e todos fizeram uma festa para agradecer a ${name}.`,
      "A joyful celebration in the magical setting, the child celebrating with the new friends.",
    ],
    [
      `Na volta, ${name} chegou a ${s.home}. Mas ${name} sabia: aquela aventura ia morar para sempre no coração.`,
      "The child back home at sunset, peaceful and happy, a small magical souvenir glowing nearby.",
    ],
  ];

  return {
    title: `${name} e ${t.titleTail}`,
    subtitle: "Uma aventura criada especialmente para você",
    coverPrompt: `The child as the hero of the adventure, standing confidently in the magical setting with ${t.slots.friendEn}, looking at the viewer with a big smile.`,
    companionLook: buddyLook,
    pages: pages.map(([text, illustrationPrompt], i) => ({ page: i + 1, text, illustrationPrompt })),
    dedication: `Para ${name}, que tem um mundo inteiro de aventuras dentro de si.`,
  };
}

export const templateProvider: TextProvider = {
  name: "template",
  async describeCharacter() {
    return { reading: NEUTRAL_READING, usage: free() };
  },
  async generateStory(input) {
    return { story: templateStory(input), usage: free() };
  },
};
