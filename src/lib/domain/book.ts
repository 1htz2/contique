import { z } from "zod";

export const BOOK_STATUSES = [
  "preview_pending",
  "preview_generating",
  "preview_ready",
  "preview_failed",
  "photo_rejected",
  "paid",
  "generating_images",
  "building_pdf",
  "completed",
  "failed",
  "deleted",
] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

export const COLORING_STATUSES = ["none", "paid", "generating", "completed", "failed"] as const;
export type ColoringStatus = (typeof COLORING_STATUSES)[number];

// What the customer's screen shows. Several storage states collapse into one view.
export type BookView =
  | "preview_generating"
  | "preview_ready"
  | "photo_rejected"
  | "preview_failed"
  | "generating"
  | "completed"
  | "failed"
  | "deleted";

export const VIEW_OF: Record<BookStatus, BookView> = {
  preview_pending: "preview_generating",
  preview_generating: "preview_generating",
  preview_ready: "preview_ready",
  preview_failed: "preview_failed",
  photo_rejected: "photo_rejected",
  paid: "generating",
  generating_images: "generating",
  building_pdf: "generating",
  completed: "completed",
  failed: "failed",
  deleted: "deleted",
};

// Ordered steps of the paid generation, for the progress screen.
export const GENERATION_STEPS = [
  { status: "paid", label: "Escrevendo a história..." },
  { status: "generating_images", label: "Criando as ilustrações..." },
  { status: "building_pdf", label: "Montando o livro..." },
  { status: "completed", label: "Preparando o PDF..." },
] as const satisfies { status: BookStatus; label: string }[];

export const PHOTO_PROBLEMS = {
  no_face: "Não encontramos um rosto na foto. Escolha uma foto de frente, com o rosto visível.",
  multiple_people: "A foto tem mais de uma pessoa. Escolha uma foto só com a criança.",
  face_not_visible: "O rosto aparece pouco (de lado, coberto ou muito longe). Escolha uma foto de frente.",
  too_dark: "A foto está escura demais. Escolha uma foto com boa luz, de preferência de dia.",
  too_blurry: "A foto está tremida ou desfocada. Escolha uma foto mais nítida.",
  not_a_photo: "Precisamos de uma foto real da criança, não de um desenho ou print.",
  not_a_child: "A foto precisa ser de uma criança.",
  inappropriate: "Esta foto não pode ser usada. Escolha outra foto da criança, de frente e vestida.",
} as const;
export type PhotoProblem = keyof typeof PHOTO_PROBLEMS;

export const PAGE_COUNT = 10;

export const StoryPage = z.object({
  page: z.number().int().min(1).max(PAGE_COUNT),
  text: z.string().trim().min(20).max(600),
  illustrationPrompt: z.string().trim().min(20).max(900),
});

export const Story = z.object({
  title: z.string().trim().min(3).max(80),
  subtitle: z.string().trim().max(120),
  coverPrompt: z.string().trim().min(20).max(900),
  companionLook: z.string().trim().max(300).nullable(),
  pages: z
    .array(StoryPage)
    .length(PAGE_COUNT)
    .refine((pages) => pages.every((p, i) => p.page === i + 1), "pages must be numbered 1..10 in order"),
  dedication: z.string().trim().min(10).max(300),
});
export type Story = z.infer<typeof Story>;
