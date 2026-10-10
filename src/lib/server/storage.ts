import "server-only";
import { db } from "./supabase";

// All three buckets are private and have no storage policies: only the service role reaches them,
// and the browser only ever sees short-lived signed URLs.
export const BUCKETS = {
  uploads: "child-uploads",
  assets: "book-assets",
  books: "generated-books",
} as const;
export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS];

const bucket = (name: Bucket) => db().storage.from(name);

export async function putFile(name: Bucket, path: string, body: Buffer, contentType: string): Promise<void> {
  const { error } = await bucket(name).upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`upload to ${name}/${path} failed: ${error.message}`);
}

export async function getFile(name: Bucket, path: string): Promise<Buffer> {
  const { data, error } = await bucket(name).download(path);
  if (error || !data) throw new Error(`download of ${name}/${path} failed: ${error?.message ?? "empty"}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function removeFiles(name: Bucket, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await bucket(name).remove(paths);
  if (error) throw new Error(`delete from ${name} failed: ${error.message}`);
}

export async function signedUrl(name: Bucket, path: string, seconds: number, download?: string): Promise<string> {
  const { data, error } = await bucket(name).createSignedUrl(path, seconds, download ? { download } : undefined);
  if (error || !data) throw new Error(`signing ${name}/${path} failed: ${error?.message ?? "empty"}`);
  return data.signedUrl;
}

export async function signedUrls(name: Bucket, paths: string[], seconds: number): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data, error } = await bucket(name).createSignedUrls(paths, seconds);
  if (error || !data) throw new Error(`signing ${name} failed: ${error?.message ?? "empty"}`);
  return new Map(data.flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl] as const] : [])));
}

// Lists every object under a folder prefix, oldest first.
export async function listFolder(name: Bucket, prefix: string) {
  const { data, error } = await bucket(name).list(prefix, { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
  if (error) throw new Error(`list ${name}/${prefix} failed: ${error.message}`);
  return data ?? [];
}

export const paths = {
  photo: (bookId: string) => `${bookId}.jpg`,
  // Illustrations are stored as JPEG (small PDFs); line art as PNG (crisp lines, small anyway).
  asset: (bookId: string, type: string, page: number) =>
    `${bookId}/${type}-${String(page).padStart(2, "0")}.${type === "coloring" ? "png" : "jpg"}`,
  bookPdf: (bookId: string) => `${bookId}/livro.pdf`,
  coloringPdf: (bookId: string) => `${bookId}/livro-para-colorir.pdf`,
};
