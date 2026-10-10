import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { PAGE_COUNT, type Story } from "@/lib/domain/book";
import { ageBand } from "@/lib/domain/book-input";
import { themeOf } from "@/lib/domain/themes";
import { SITE_NAME } from "@/lib/site";

// A4 portrait in points. The margin keeps text and art clear of what home printers cannot reach.
const W = 595.28;
const H = 841.89;
const M = 40;
const CREAM = rgb(0.988, 0.969, 0.937);
const INK = rgb(0.17, 0.14, 0.12);
const SOFT = rgb(0.45, 0.4, 0.36);

const hex = (value: string): RGB => {
  const n = parseInt(value.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

type Fonts = { title: PDFFont; body: PDFFont; bold: PDFFont };

let fontBytes: Promise<[Buffer, Buffer, Buffer]> | undefined;
const loadFontBytes = () =>
  (fontBytes ??= Promise.all(
    ["Fraunces-SemiBold.ttf", "Nunito-Medium.ttf", "Nunito-ExtraBold.ttf"].map((f) => readFile(join(process.cwd(), "public/fonts", f))),
  ) as Promise<[Buffer, Buffer, Buffer]>);

async function newDocument(title: string): Promise<{ pdf: PDFDocument; fonts: Fonts }> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(title);
  pdf.setAuthor(SITE_NAME);
  pdf.setCreator(SITE_NAME);
  pdf.setProducer(SITE_NAME);
  const [title_, body, bold] = await loadFontBytes();
  const fonts = {
    title: await pdf.embedFont(title_, { subset: true }),
    body: await pdf.embedFont(body, { subset: true }),
    bold: await pdf.embedFont(bold, { subset: true }),
  };
  return { pdf, fonts };
}

// Drops characters the embedded fonts cannot draw (emoji, rare symbols) instead of failing the PDF.
function drawable(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet());
  return [...text].filter((ch) => ch === " " || ch === "\n" || supported.has(ch.codePointAt(0)!)).join("");
}

export function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function drawLines(
  page: PDFPage,
  lines: string[],
  opts: { font: PDFFont; size: number; top: number; lineHeight: number; color: RGB; align: "center" | "left"; left?: number; width?: number },
) {
  const left = opts.left ?? M;
  const width = opts.width ?? W - 2 * M;
  lines.forEach((line, i) => {
    const w = opts.font.widthOfTextAtSize(line, opts.size);
    const x = opts.align === "center" ? left + (width - w) / 2 : left;
    page.drawText(line, { x, y: opts.top - opts.size - i * opts.size * opts.lineHeight, size: opts.size, font: opts.font, color: opts.color });
  });
  return opts.top - lines.length * opts.size * opts.lineHeight;
}

// Largest size from `sizes` at which the text fits in `maxLines` lines.
function fitText(text: string, font: PDFFont, sizes: number[], maxWidth: number, maxLines: number) {
  for (const size of sizes) {
    const lines = wrap(text, font, size, maxWidth);
    if (lines.length <= maxLines) return { size, lines };
  }
  const size = sizes[sizes.length - 1];
  return { size, lines: wrap(text, font, size, maxWidth) };
}

function drawImageCover(page: PDFPage, image: PDFImage, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / image.width, height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, { x: x + (width - w) / 2, y: y + (height - h) / 2, width: w, height: h });
}

function heart(page: PDFPage, cx: number, cy: number, size: number, color: RGB) {
  const s = size / 24;
  page.drawSvgPath("M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.5.7-1.3 2.2-2.5 4.3-2.5 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z", {
    x: cx - 12 * s,
    y: cy + 12 * s,
    scale: s,
    color,
  });
}

// Shown in place of an illustration that failed every retry: the book still ships complete.
function placeholderArt(page: PDFPage, x: number, y: number, width: number, height: number, themeId: string) {
  const { from, to } = themeOf(themeId).colors;
  page.drawRectangle({ x, y, width, height, color: hex(from) });
  page.drawRectangle({ x, y, width, height: height * 0.35, color: hex(to), opacity: 0.6 });
  for (let i = 0; i < 9; i++) {
    page.drawCircle({ x: x + width * ((i * 0.37) % 1), y: y + height * (0.45 + ((i * 0.23) % 0.5)), size: 3 + (i % 3) * 2, color: rgb(1, 1, 1), opacity: 0.7 });
  }
}

function pageNumber(page: PDFPage, n: number, fonts: Fonts) {
  const label = String(n);
  page.drawText(label, { x: (W - fonts.body.widthOfTextAtSize(label, 10)) / 2, y: 22, size: 10, font: fonts.body, color: SOFT });
}

function finalPage(pdf: PDFDocument, fonts: Fonts, childName: string, dedication: string, accent: RGB, kind: "book" | "coloring") {
  const page = pdf.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: CREAM });
  const name = drawable(fonts.title, childName);
  const headline = fitText(`Esta história foi criada especialmente para ${name}.`, fonts.title, [30, 26, 22], W - 2 * M - 40, 4);
  let y = drawLines(page, headline.lines, { font: fonts.title, size: headline.size, top: H * 0.66, lineHeight: 1.2, color: INK, align: "center" });
  const body = wrap(drawable(fonts.body, dedication), fonts.body, 15, W - 2 * M - 80);
  y = drawLines(page, body, { font: fonts.body, size: 15, top: y - 24, lineHeight: 1.45, color: SOFT, align: "center" });
  const wish = kind === "book" ? "Feliz Dia das Crianças" : "Boas pinturas!";
  y = drawLines(page, [wish], { font: fonts.bold, size: 18, top: y - 40, lineHeight: 1.2, color: accent, align: "center" });
  heart(page, W / 2, y - 26, 26, accent);
  const credit = `Feito com carinho por ${SITE_NAME}`;
  page.drawText(credit, { x: (W - fonts.body.widthOfTextAtSize(credit, 9)) / 2, y: 30, size: 9, font: fonts.body, color: SOFT });
}

export type BookPdfInput = {
  story: Story;
  theme: string;
  childName: string;
  childAge: number;
  cover: Buffer;
  pages: Map<number, Buffer>;
};

export async function generateBookPdf({ story, theme, childName, childAge, cover, pages }: BookPdfInput): Promise<Buffer> {
  const { pdf, fonts } = await newDocument(story.title);
  const colors = themeOf(theme).colors;
  const accent = hex(colors.ink);

  // Cover: full-bleed art with the title set in real type (image models misspell names).
  const coverPage = pdf.addPage([W, H]);
  drawImageCover(coverPage, await pdf.embedJpg(cover), 0, 0, W, H);
  const title = fitText(drawable(fonts.title, story.title), fonts.title, [44, 40, 36, 32, 28], W - 2 * M - 48, 3);
  const titleHeight = title.lines.length * title.size * 1.12;
  const subtitle = story.subtitle ? wrap(drawable(fonts.body, story.subtitle), fonts.body, 14, W - 2 * M - 64) : [];
  const panelHeight = titleHeight + (subtitle.length ? subtitle.length * 14 * 1.4 + 12 : 0) + 44;
  coverPage.drawRectangle({ x: M, y: H - M - panelHeight, width: W - 2 * M, height: panelHeight, color: CREAM, opacity: 0.88, borderWidth: 0 });
  const afterTitle = drawLines(coverPage, title.lines, { font: fonts.title, size: title.size, top: H - M - 22, lineHeight: 1.12, color: INK, align: "center" });
  if (subtitle.length) drawLines(coverPage, subtitle, { font: fonts.body, size: 14, top: afterTitle - 10, lineHeight: 1.4, color: SOFT, align: "center" });

  const textSize = { small: 26, middle: 22, big: 18 }[ageBand(childAge)];

  for (const storyPage of story.pages) {
    const page = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: CREAM });
    const artW = W - 2 * M;
    const artH = artW * 0.75;
    // Alternating art above and below the text gives the book a picture-book rhythm.
    const artTop = storyPage.page % 2 === 1;
    const artY = artTop ? H - M - artH : M + 24;
    const image = pages.get(storyPage.page);
    if (image) drawImageCover(page, await pdf.embedJpg(image), M, artY, artW, artH);
    else placeholderArt(page, M, artY, artW, artH, theme);

    const textTop = artTop ? artY - 36 : H - M - 20;
    const textBottom = artTop ? M + 30 : artY + artH + 24;
    const room = textTop - textBottom;
    const sizes = [textSize, textSize - 2, textSize - 4, 13];
    const fitted =
      sizes.map((size) => ({ size, lines: wrap(drawable(fonts.body, storyPage.text), fonts.body, size, artW - 24) })).find(
        (f) => f.lines.length * f.size * 1.45 <= room,
      ) ?? { size: 13, lines: wrap(drawable(fonts.body, storyPage.text), fonts.body, 13, artW - 24) };
    const blockHeight = fitted.lines.length * fitted.size * 1.45;
    drawLines(page, fitted.lines, {
      font: fonts.body,
      size: fitted.size,
      top: textTop - (room - blockHeight) / 2,
      lineHeight: 1.45,
      color: INK,
      align: "center",
      left: M + 12,
      width: artW - 24,
    });
    pageNumber(page, storyPage.page, fonts);
  }

  finalPage(pdf, fonts, childName, story.dedication, accent, "book");
  return Buffer.from(await pdf.save());
}

export type ColoringPdfInput = { story: Story; theme: string; childName: string; pages: Map<number, Buffer> };

export async function generateColoringPdf({ story, theme, childName, pages }: ColoringPdfInput): Promise<Buffer> {
  const { pdf, fonts } = await newDocument(`${story.title} - para colorir`);
  const accent = hex(themeOf(theme).colors.ink);

  const cover = pdf.addPage([W, H]);
  const name = drawable(fonts.title, childName);
  const heading = fitText(`O livro de colorir de ${name}`, fonts.title, [40, 34, 30], W - 2 * M, 3);
  const y = drawLines(cover, heading.lines, { font: fonts.title, size: heading.size, top: H * 0.62, lineHeight: 1.15, color: INK, align: "center" });
  drawLines(cover, wrap(drawable(fonts.body, story.title), fonts.body, 16, W - 2 * M), {
    font: fonts.body,
    size: 16,
    top: y - 16,
    lineHeight: 1.4,
    color: SOFT,
    align: "center",
  });
  cover.drawRectangle({ x: M, y: M, width: W - 2 * M, height: H - 2 * M, borderColor: INK, borderWidth: 2, opacity: 0 });

  for (const n of Array.from({ length: PAGE_COUNT }, (_, i) => i + 1)) {
    const art = pages.get(n);
    if (!art) continue;
    const page = pdf.addPage([W, H]);
    const artW = W - 2 * M;
    const artH = artW * 0.75;
    const artY = H - M - artH - 20;
    const image = await pdf.embedPng(art);
    drawImageCover(page, image, M, artY, artW, artH);
    page.drawRectangle({ x: M, y: artY, width: artW, height: artH, borderColor: INK, borderWidth: 1.5, opacity: 0 });
    const text = story.pages[n - 1]?.text ?? "";
    drawLines(page, wrap(drawable(fonts.body, text), fonts.body, 13, artW - 24), {
      font: fonts.body,
      size: 13,
      top: artY - 24,
      lineHeight: 1.45,
      color: SOFT,
      align: "center",
      left: M + 12,
      width: artW - 24,
    });
    pageNumber(page, n, fonts);
  }

  finalPage(pdf, fonts, childName, story.dedication, accent, "coloring");
  return Buffer.from(await pdf.save());
}
