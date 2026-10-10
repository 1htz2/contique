import "server-only";
import { assets, books, type BookRow } from "./books";
import { env } from "./env";
import { advanceBook, needsWork } from "./pipeline";
import { BUCKETS, listFolder, paths, removeFiles } from "./storage";

// Normally a photo is deleted seconds after upload, once the preview is ready. Anything older than
// this was left behind by a failure and is purged by the daily sweep.
export const PHOTO_MAX_AGE_MS = 24 * 3600_000;
// Previews nobody bought keep their cover this long, so a parent can come back and pay.
const UNPAID_PREVIEW_DAYS = 7;

// Idempotent: removes every upload older than the cutoff, whether or not a book row knows it.
export async function purgeOldPhotos(now = Date.now()): Promise<number> {
  const cutoff = now - PHOTO_MAX_AGE_MS;
  let removed = 0;
  for (;;) {
    const files = await listFolder(BUCKETS.uploads, "");
    const old = files.filter((f) => f.created_at && Date.parse(f.created_at) < cutoff).map((f) => f.name);
    if (old.length === 0) break;
    await removeFiles(BUCKETS.uploads, old);
    removed += old.length;
    if (old.length < 1000) break;
  }
  const { error } = await books()
    .update({ photo_deleted_at: new Date(now).toISOString() })
    .is("photo_deleted_at", null)
    .not("photo_path", "is", null)
    .lt("created_at", new Date(cutoff).toISOString());
  if (error) throw new Error(`photo bookkeeping failed: ${error.message}`);
  return removed;
}

async function eraseFiles(book: Pick<BookRow, "id">) {
  const files = await listFolder(BUCKETS.assets, book.id);
  await removeFiles(BUCKETS.assets, files.map((f) => `${book.id}/${f.name}`));
  await removeFiles(BUCKETS.books, [paths.bookPdf(book.id), paths.coloringPdf(book.id)]);
  await assets().delete().eq("book_id", book.id);
}

// Generated books stay downloadable for BOOK_RETENTION_DAYS; unpaid previews for a week.
export async function applyRetention(now = Date.now()): Promise<number> {
  const day = 86_400_000;
  const paidCutoff = new Date(now - env().BOOK_RETENTION_DAYS * day).toISOString();
  const previewCutoff = new Date(now - UNPAID_PREVIEW_DAYS * day).toISOString();
  const { data, error } = await books()
    .select("id, status")
    .or(
      `and(status.eq.completed,completed_at.lt.${paidCutoff}),and(status.in.(preview_ready,preview_failed,photo_rejected),created_at.lt.${previewCutoff}),status.eq.deleted`,
    )
    .not("cover_path", "is", null)
    .limit(200);
  if (error) throw new Error(error.message);
  for (const book of data ?? []) {
    await eraseFiles(book);
    await books()
      .update({ cover_path: null, pdf_path: null, coloring_pdf_path: null, character_json: null, updated_at: new Date().toISOString() })
      .eq("id", book.id);
  }
  return data?.length ?? 0;
}

// Backstop for books whose triggers all failed (webhook lost, customer closed the tab).
export async function resumeStalled(deadline: number): Promise<number> {
  const staleBefore = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data, error } = await books()
    .select("id, status, coloring_status, lease_until")
    .or("status.in.(preview_pending,preview_generating,paid,generating_images,building_pdf),coloring_status.in.(paid,generating)")
    .lt("updated_at", staleBefore)
    .order("updated_at")
    .limit(20);
  if (error) throw new Error(error.message);
  let resumed = 0;
  for (const book of (data ?? []) as Pick<BookRow, "id" | "status" | "coloring_status" | "lease_until">[]) {
    if (Date.now() > deadline) break;
    if (!needsWork(book)) continue;
    await advanceBook(book.id);
    resumed++;
  }
  return resumed;
}
