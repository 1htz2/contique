// The only free text a customer types is the child's name, a companion name and a short list of
// interests. Everything else comes from fixed options. This list catches the obvious attempts to
// steer a children's book somewhere it must not go; the story model's system prompt is the second
// layer.
const BLOCKED = [
  "sexo", "sexual", "sexy", "sensual", "nu", "nua", "nus", "nuas", "pelado", "pelada", "nudez", "porn", "porno",
  "pornografia", "xxx", "erotico", "erotica", "fetiche", "lingerie", "biquini", "calcinha", "cueca", "beijo", "namorar",
  "namorada", "namorado", "transar", "estupro", "abuso", "pedofilo", "pedofilia",
  "arma", "armas", "revolver", "pistola", "fuzil", "metralhadora", "faca", "facada", "tiro", "tiros", "bomba", "granada",
  "sangue", "sangrento", "morte", "morto", "morta", "matar", "assassino", "assassinato", "suicidio", "tortura", "guerra",
  "terror", "terrorista", "zumbi", "cadaver", "demonio", "diabo", "satanas", "inferno",
  "droga", "drogas", "cocaina", "maconha", "crack", "cigarro", "fumar", "cerveja", "vodka", "bebida", "bebado", "cachaca",
  "nazi", "nazista", "hitler", "racista", "racismo", "odio", "kkk",
  "bolsonaro", "politica", "partido", "eleicao",
  "porra", "caralho", "merda", "puta", "foda", "buceta", "piroca", "cu", "viado", "bosta",
];

const BLOCKED_SET = new Set(BLOCKED);

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

export function containsBlockedTerm(text: string): boolean {
  const words = normalize(text).split(/[^a-z0-9]+/).filter(Boolean);
  return words.some((word) => BLOCKED_SET.has(word));
}
