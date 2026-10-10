import "server-only";
import sharp from "sharp";
import { themeOf } from "@/lib/domain/themes";
import type { IllustrationRequest, ImageProvider } from "./types";

const DIMENSIONS = { "3:4": [960, 1280], "4:3": [1280, 960] } as const;

const escape = (text: string) => text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

// A drawn placeholder in the book's colors, so the whole flow (preview, PDF, coloring) runs locally
// without any image API. It is never used in production unless IMAGE_AI_PROVIDER=mock.
function scene(request: IllustrationRequest): string {
  const [w, h] = DIMENSIONS[request.aspect];
  const { colors } = themeOf(request.hint.theme);
  const cx = w / 2;
  const ground = h * 0.72;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${colors.from}"/><stop offset="1" stop-color="${colors.to}"/></linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#sky)"/>
  <circle cx="${w * 0.8}" cy="${h * 0.2}" r="${h * 0.08}" fill="#FFF3C4" opacity="0.9"/>
  <path d="M0 ${ground} Q ${w * 0.25} ${ground - h * 0.12} ${w * 0.5} ${ground} T ${w} ${ground} V ${h} H 0 Z" fill="${colors.ink}" opacity="0.35"/>
  <path d="M0 ${ground + h * 0.08} Q ${w * 0.3} ${ground - h * 0.02} ${w * 0.65} ${ground + h * 0.08} T ${w} ${ground + h * 0.06} V ${h} H 0 Z" fill="${colors.ink}" opacity="0.55"/>
  <g transform="translate(${cx} ${ground - h * 0.02})">
    <rect x="-${h * 0.07}" y="-${h * 0.2}" width="${h * 0.14}" height="${h * 0.2}" rx="${h * 0.05}" fill="#F2B544"/>
    <circle cx="0" cy="-${h * 0.27}" r="${h * 0.075}" fill="#F1C7A5"/>
    <path d="M-${h * 0.08} -${h * 0.28} Q 0 -${h * 0.4} ${h * 0.08} -${h * 0.28} Q ${h * 0.05} -${h * 0.33} 0 -${h * 0.32} Q -${h * 0.05} -${h * 0.33} -${h * 0.08} -${h * 0.28} Z" fill="#4A3426"/>
    <circle cx="-${h * 0.025}" cy="-${h * 0.265}" r="${h * 0.008}" fill="#2B1D14"/>
    <circle cx="${h * 0.025}" cy="-${h * 0.265}" r="${h * 0.008}" fill="#2B1D14"/>
    <path d="M-${h * 0.02} -${h * 0.235} Q 0 -${h * 0.22} ${h * 0.02} -${h * 0.235}" stroke="#2B1D14" stroke-width="${h * 0.005}" fill="none" stroke-linecap="round"/>
  </g>
  <text x="${cx}" y="${h - h * 0.05}" text-anchor="middle" font-family="sans-serif" font-size="${h * 0.035}" fill="#ffffff" opacity="0.85">${escape(request.hint.label)}</text>
</svg>`;
}

// Edge detection over the colored page: a usable coloring page with no image API, and the fallback
// when the AI conversion fails.
export async function lineArt(image: Buffer): Promise<Buffer> {
  const { width = 1280 } = await sharp(image).metadata();
  const edges = await sharp(image)
    .resize({ width: Math.min(width, 1600) })
    .greyscale()
    .blur(1.6)
    .convolve({ width: 3, height: 3, kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1], scale: 1, offset: 0 })
    .linear(6, 0)
    .threshold(60)
    .negate()
    .median(3)
    .toBuffer();
  return sharp(edges).png({ palette: true, colours: 2 }).toBuffer();
}

export const mockProvider: ImageProvider = {
  name: "mock",
  model: "mock",
  async generate(request) {
    const started = Date.now();
    const image =
      request.operation === "coloring" && request.references[0]
        ? await lineArt(request.references[0])
        : await sharp(Buffer.from(scene(request))).jpeg({ quality: 88 }).toBuffer();
    return {
      image,
      usage: { provider: "mock", model: "mock", inputTokens: null, outputTokens: null, costUsd: 0, latencyMs: Date.now() - started },
    };
  },
};
