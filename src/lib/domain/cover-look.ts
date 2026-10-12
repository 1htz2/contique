import { ageBand, type AgeBand } from "./book-input";

// How the book looks for each age band. The web preview, the PDF and the illustration prompt all
// read from here, so a toddler's book is playful everywhere and a 12-year-old's is not.
export type CoverLook = {
  font: "fredoka" | "baloo" | "lilita";
  pdfFont: string;
  // bubble: rounded light card; ribbon: band in the theme color; shade: dark fade with white type.
  panel: "bubble" | "ribbon" | "shade";
  // English, for image prompts.
  art: string;
};

export const COVER_LOOKS: Record<AgeBand, CoverLook> = {
  small: {
    font: "fredoka",
    pdfFont: "Fredoka-Bold.ttf",
    panel: "bubble",
    art: "Toddler picture book style: extra cute and cuddly, chunky rounded shapes, big round heads and big sparkly eyes, bright cheerful colors, simple uncluttered backgrounds, soft gouache textures.",
  },
  middle: {
    font: "baloo",
    pdfFont: "Baloo2-ExtraBold.ttf",
    panel: "ribbon",
    art: "Premium modern picture book style: soft gouache and colored pencil textures, warm rounded shapes, gentle storybook lighting, soft but vibrant palette, expressive friendly faces, a sense of adventure.",
  },
  big: {
    font: "lilita",
    pdfFont: "LilitaOne-Regular.ttf",
    panel: "shade",
    art: "Middle-grade adventure novel illustration style: dynamic composition, detailed painterly backgrounds, cinematic lighting, natural proportions, confident heroic poses, exciting and cool rather than cute or babyish.",
  },
};

export const coverLookOf = (age: number): CoverLook => COVER_LOOKS[ageBand(age)];
