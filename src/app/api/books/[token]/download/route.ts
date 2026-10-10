import { findBookByToken, storyOf } from "@/lib/server/books";
import { recordEvent } from "@/lib/server/events";
import { rateLimit } from "@/lib/server/rate-limit";
import { apiError } from "@/lib/server/request";
import { BUCKETS, signedUrl } from "@/lib/server/storage";

const LINK_SECONDS = 10 * 60;

const fileName = (title: string, suffix = "") =>
  `${title.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9 -]/g, "").trim().slice(0, 80) || "livro"}${suffix}.pdf`;

// The PDF is never public: each click gets a fresh signed URL that expires in minutes. `?view=1`
// opens it in the browser instead of downloading.
export async function GET(req: Request, ctx: RouteContext<"/api/books/[token]/download">) {
  if (!(await rateLimit(req, "download"))) return apiError("rate_limited", 429);
  const book = await findBookByToken((await ctx.params).token);
  if (!book) return apiError("not_found", 404);

  const query = new URL(req.url).searchParams;
  const coloring = query.get("file") === "coloring";
  const path = coloring ? book.coloring_pdf_path : book.pdf_path;
  const ready = coloring ? book.coloring_status === "completed" : book.status === "completed";
  if (!ready || !path) return apiError("not_ready", 409);

  const title = storyOf(book)?.title ?? `Livro de ${book.child_first_name}`;
  const download = query.get("view") === "1" ? undefined : fileName(title, coloring ? " - para colorir" : "");
  const url = await signedUrl(BUCKETS.books, path, LINK_SECONDS, download);
  await recordEvent(book.id, "pdf_downloaded", crypto.randomUUID(), { file: coloring ? "coloring" : "book", view: !download });
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
