// Prepared in the browser: decoded (EXIF orientation applied by the <img> path), reduced to at most
// 1280 px and re-encoded as JPEG. Smaller uploads on 4G, and the server only ever sees one format.
const MAX_SIDE = 1280;
const JPEG_QUALITY = 0.88;
export const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp,image/heic,image/heif";

export type PreparedPhoto = { jpeg: Blob; previewUrl: string; dark: boolean; small: boolean };

async function decode(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } finally {
    URL.revokeObjectURL(url);
  }
  return img;
}

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode_failed"))), "image/jpeg", JPEG_QUALITY),
  );

// Mean luma on a small thumbnail: a hint for the parent, the server's vision check decides.
function meanLuma(ctx: CanvasRenderingContext2D, width: number, height: number): number {
  const { data } = ctx.getImageData(0, 0, width, height);
  let sum = 0;
  for (let i = 0; i < data.length; i += 16) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  return sum / (data.length / 16);
}

export async function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  const img = await decode(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const jpeg = await toBlob(canvas);
  return {
    jpeg,
    previewUrl: URL.createObjectURL(jpeg),
    dark: meanLuma(ctx, canvas.width, canvas.height) < 55,
    small: Math.min(canvas.width, canvas.height) < 320,
  };
}
