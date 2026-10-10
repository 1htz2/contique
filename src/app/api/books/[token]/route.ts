import { after } from "next/server";
import { PAGE_COUNT, VIEW_OF } from "@/lib/domain/book";
import type { BookStatusResponse } from "@/lib/contracts";
import { assets, books, findBookByToken } from "@/lib/server/books";
import { recordEvent } from "@/lib/server/events";
import { advanceBook, needsWork } from "@/lib/server/pipeline";
import { rateLimit } from "@/lib/server/rate-limit";
import { apiError, json } from "@/lib/server/request";
import { BUCKETS, listFolder, paths, removeFiles } from "@/lib/server/storage";

// Polling a book also resumes it: if no worker holds its lease and work is left, this invocation
// runs the pipeline in after(). Refreshing the page mid-generation is therefore harmless.
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" };

async function progressOf(bookId: string, status: string): Promise<number> {
  if (status === "paid") return 0.05;
  if (status === "building_pdf") return 0.95;
  if (status !== "generating_images") return 1;
  const { count } = await assets()
    .select("id", { count: "exact", head: true })
    .eq("book_id", bookId)
    .eq("type", "page")
    .neq("status", "pending");
  return 0.1 + 0.8 * ((count ?? 0) / PAGE_COUNT);
}

export async function GET(req: Request, ctx: RouteContext<"/api/books/[token]">) {
  if (!(await rateLimit(req, "bookStatus"))) return apiError("rate_limited", 429);
  const book = await findBookByToken((await ctx.params).token);
  if (!book) return json({ error: "not_found" }, 404, NO_STORE);

  if (needsWork(book)) after(() => advanceBook(book.id));
  return json<BookStatusResponse>(
    {
      view: VIEW_OF[book.status],
      status: book.status,
      coloring: book.coloring_status,
      progress: await progressOf(book.id, book.status),
    },
    200,
    NO_STORE,
  );
}

// Erases everything derived from the child: photo, illustrations, PDFs, story and character. The
// payment rows stay, they hold no child data and are a fiscal record. Idempotent.
export async function DELETE(req: Request, ctx: RouteContext<"/api/books/[token]">) {
  if (!(await rateLimit(req, "deleteData"))) return apiError("rate_limited", 429);
  const book = await findBookByToken((await ctx.params).token);
  if (!book) return apiError("not_found", 404);

  const files = await listFolder(BUCKETS.assets, book.id);
  await removeFiles(BUCKETS.assets, files.map((f) => `${book.id}/${f.name}`));
  await removeFiles(BUCKETS.books, [paths.bookPdf(book.id), paths.coloringPdf(book.id)]);
  if (book.photo_path) await removeFiles(BUCKETS.uploads, [book.photo_path]);
  await assets().delete().eq("book_id", book.id);

  const now = new Date().toISOString();
  const { error } = await books()
    .update({
      status: "deleted",
      deleted_at: now,
      updated_at: now,
      photo_deleted_at: book.photo_deleted_at ?? now,
      child_first_name: "-",
      child_nickname: null,
      interests: null,
      companion_json: null,
      story_json: null,
      character_json: null,
      cover_path: null,
      pdf_path: null,
      coloring_pdf_path: null,
      client_ip: null,
      client_user_agent: null,
    })
    .eq("id", book.id);
  if (error) return apiError("internal_error", 500);
  await recordEvent(book.id, "data_deleted", book.id);
  return new Response(null, { status: 204 });
}
