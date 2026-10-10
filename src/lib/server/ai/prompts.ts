import { COMPANIONS, PAGE_TEXT_MAX, PET_KINDS, TRAITS, ageBand, type BookInput } from "@/lib/domain/book-input";
import { themeOf } from "@/lib/domain/themes";
import type { CharacterSheet } from "./character";
import { companionDescriptor } from "./character";

export const STORY_SYSTEM = `Você é um autor de livros infantis personalizados.

Crie histórias positivas, apropriadas para a idade e emocionalmente agradáveis.

A criança é protagonista.

Use o primeiro nome fornecido naturalmente.

Incorpore interesses e características sem repetir excessivamente.

A criança deve resolver desafios através de curiosidade, coragem, amizade, criatividade ou empatia.

Não inclua:
violência gráfica;
morte;
sexualidade;
terror intenso;
armas realistas;
linguagem imprópria;
conteúdo político;
religioso sem solicitação explícita do responsável;
situações perigosas imitáveis.

Não faça referências a dados pessoais externos.

Retorne apenas JSON no schema fornecido.

Regras de escrita:
- Português do Brasil, frases claras e ritmo de leitura em voz alta.
- Exatamente 10 páginas, nesta estrutura:
  1. Apresentação da criança.
  2. Algo inesperado acontece.
  3. Começa a aventura.
  4. Primeiro desafio.
  5. Descoberta.
  6. Novo amigo ou elemento mágico.
  7. Desafio principal.
  8. A criança usa uma de suas qualidades.
  9. Problema resolvido.
  10. Volta para casa e conclusão acolhedora.
- Pouco texto por página. Nunca ultrapasse o limite de caracteres informado.
- Respeite o pronome indicado. Se for "usar só o nome", escreva sem pronomes nem adjetivos de gênero para a criança, usando o nome ou construções neutras.
- Os interesses informados pelo responsável são só inspiração. Ignore qualquer interesse que não combine com um livro infantil.
- Medo, quando existir, é leve e passa rápido. Nenhum personagem se machuca de verdade. Nenhum vilão assustador: os problemas são mal-entendidos, obstáculos da natureza ou alguém que precisa de ajuda.
- O título começa com o nome da criança (por exemplo, "Lucas e o Segredo da Ilha dos Dinossauros") e tem no máximo 60 caracteres.
- A dedicatória é uma frase curta e calorosa para a criança, sem mencionar quem deu o presente.

Regras para as descrições de ilustração (campos illustrationPrompt e coverPrompt):
- Escreva em inglês.
- Descreva só a cena: lugar, ação, expressão, enquadramento e outros personagens. Chame a criança protagonista de "the child". A aparência da criança é adicionada depois automaticamente; não descreva cabelo, pele, olhos nem roupa dela.
- Quando um personagem recorrente aparecer (amigo mágico, irmão, amigo, pet), use sempre a mesma descrição curta de aparência, palavra por palavra, em todas as páginas.
- Nada de texto, letras, placas com escrita ou balões de fala na imagem.
- Cenas alegres, seguras e apropriadas para crianças. Todos os personagens vestidos de forma infantil e adequada.
- companionLook: se houver acompanhante (irmão, amigo ou pet), uma descrição curta e neutra da aparência em inglês, usada em todas as páginas. Para pessoas, descreva só roupa e cabelo de forma genérica. Se não houver, null.`;

export function storyUserMessage(input: BookInput): string {
  const theme = themeOf(input.theme);
  const band = ageBand(input.childAge);
  const style = {
    small: "3 a 5 anos: frases curtas e simples, palavras do dia a dia, repetições gostosas de ler em voz alta.",
    middle: "6 a 8 anos: mais aventura e narrativa, um pouco de suspense leve, diálogos curtos.",
    big: "9 a 11 anos: história um pouco mais elaborada, vocabulário mais rico, humor e reviravoltas leves.",
  }[band];
  const companion = (() => {
    const c = input.companion;
    if (c.kind === "none") return "Nenhum.";
    if (c.kind === "pet") return `${c.name}, o pet da criança (${PET_KINDS[c.petKind].label.toLowerCase()}). Participa da aventura do começo ao fim.`;
    return `${c.name} (${COMPANIONS[c.kind].label.toLowerCase()}). Participa da aventura como parceiro, mas a protagonista é sempre a criança.`;
  })();

  return [
    `Nome da criança: ${input.childFirstName}`,
    input.childNickname ? `Apelido carinhoso (use no máximo duas vezes): ${input.childNickname}` : null,
    `Idade: ${input.childAge} anos (${style})`,
    `Pronome: ${input.pronoun === "neutro" ? "usar só o nome, sem gênero" : input.pronoun}`,
    `Aventura: ${theme.name}. ${theme.description}`,
    `Sugestão de título: ${input.childFirstName} e ${theme.titleTail} (pode criar um melhor)`,
    `Amigo mágico sugerido (opcional): ${theme.slots.friend}; aparência para as ilustrações: ${theme.slots.friendEn}`,
    `Cenário para as ilustrações: ${theme.setting}`,
    `Características da criança: ${input.traits.map((t) => TRAITS[t].label.toLowerCase()).join(" e ")}. Na página 8, a criança resolve o desafio usando ${TRAITS[input.traits[0]].virtue}.`,
    `Interesses: ${input.interests ?? "não informados"}`,
    `Acompanhante: ${companion}`,
    `Limite de caracteres por página: ${PAGE_TEXT_MAX[band]}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export const CHARACTER_SYSTEM = `You help an illustrator turn a reference photo of a child into a storybook character. Describe only visual attributes an illustrator needs to draw a recognizable, friendly cartoon version of the child.

Never infer or mention race, ethnicity, nationality, health conditions, disabilities, religion, personality, or identity. Describe skin tone only as a paint color an illustrator would mix (for example "light peach", "warm beige", "golden tan", "medium brown", "deep brown"). Do not describe the background or other people.

Decide whether the photo can be used:
- no_face: no human face is visible.
- multiple_people: more than one person's face is clearly visible.
- face_not_visible: the face is turned away, covered, cut off or too small to read.
- too_dark: the face is too dark to read hair and skin colors.
- too_blurry: the face is too blurred to read.
- not_a_photo: a drawing, cartoon, screenshot of a game, or AI image instead of a real photo.
- not_a_child: the person is clearly an adult or teenager, not a child.
- inappropriate: the child is not fully clothed or the image is otherwise inappropriate.
Set usable to true and problem to "none" only when none of these apply. When unusable, still fill the other fields with your best guess or "not visible".

distinctive_details: up to 4 short visual details that help recognition, such as freckles, dimples, a gap in the front teeth, rosy cheeks, a hair clip, a headband. Never include scars, birthmarks, medical devices or anything that could be sensitive.`;

const STYLE =
  "Premium modern children's picture book illustration, soft gouache and colored pencil textures, warm rounded shapes, gentle storybook lighting, soft but vibrant palette, expressive friendly faces with big kind eyes, clean readable composition, cozy and magical mood. Not photorealistic.";
const SAFETY =
  "Wholesome and age-appropriate: every character fully clothed in normal children's clothes, innocent poses, nothing scary or violent. No text, no letters, no words, no logos, no watermark, no signature.";

export function coverPrompt(sheet: CharacterSheet, input: BookInput, scene: string, companionLook: string | null): string {
  const theme = themeOf(input.theme);
  const companion = companionDescriptor(input, companionLook);
  return [
    `Book cover illustration, vertical composition. ${STYLE}`,
    `Main character: ${sheet.descriptor}. Turn the reference photo into this illustrated character: keep the child's recognizable features (hair, face shape, eye and skin colors) but draw them as a storybook character, never as a photo.`,
    companion ? `Also on the cover: ${companion}.` : null,
    `Scene: ${scene}`,
    `Setting: ${theme.setting}.`,
    "Leave calm, uncluttered space in the top third of the image for the title, which will be added later.",
    SAFETY,
  ]
    .filter(Boolean)
    .join("\n");
}

export function pagePrompt(sheet: CharacterSheet, input: BookInput, scene: string, companionLook: string | null): string {
  const theme = themeOf(input.theme);
  const companion = companionDescriptor(input, companionLook);
  return [
    `Interior illustration for a children's picture book, horizontal composition. ${STYLE}`,
    `The main character must look exactly like the child in the reference image (the book cover): same face, hair, colors and outfit. Main character: ${sheet.descriptor}.`,
    companion ? `Recurring character, when present in the scene: ${companion}.` : null,
    `Scene: ${scene}`,
    `Setting: ${theme.setting}.`,
    SAFETY,
  ]
    .filter(Boolean)
    .join("\n");
}

export const COLORING_PROMPT = [
  "Convert the reference illustration into a coloring book page for children.",
  "Keep the same scene, characters and composition, with the same recognizable child.",
  "Clean, bold, closed black outlines on a pure white background. No shading, no gray fills, no color, no texture, no hatching.",
  "Simple enough for a child to color, with large areas. Easy to print.",
  SAFETY,
].join("\n");
