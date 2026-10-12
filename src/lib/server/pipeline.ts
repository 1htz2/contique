import "server-only";
import { after } from "next/server";
import { PAGE_COUNT, type BookStatus, type PhotoProblem } from "@/lib/domain/book";
import { ContentBlockedError, describeCharacter, generateIllustration, generateStory, lineArt } from "./ai";
import { buildCharacter } from "./ai/character";
import { COLORING_PROMPT, coverPrompt, pagePrompt } from "./ai/prompts";
import {
  assets,
  findBook,
  inputOf,
  listAssets,
  storyOf,
  transition,
  updateBook,
  type AssetRow,
  type AssetType,
  type BookRow,
} from "./books";
import { env, type Product } from "./env";
import { recordEvent } from "./events";
import { generateBookPdf, generateColoringPdf } from "./pdf";
import { BUCKETS, getFile, paths, putFile, removeFiles } from "./storage";
import { db } from "./supabase";

// Book lifecycle. advanceBook() reads the stored state and performs whatever step is missing, so it
// can run any number of times, from any point, after any crash: every trigger (book creation,
// payment webhook, status polling, cron) just calls it again.

const LEASE_SECONDS = 300;
// Leaves room inside a 300 s serverless invocation to release the lease cleanly.
const BUDGET_MS = 240_000;
const MAX_ASSET_ATTEMPTS = 3;
const MAX_BOOK_ATTEMPTS = 5;
const RETRY_BACKOFF_SECONDS = 20;

const PREVIEW: BookStatus[] = ["preview_pending", "preview_generating"];
const PAID: BookStatus[] = ["paid", "generating_images", "building_pdf"];

export function needsWork(book: Pick<BookRow, "status" | "coloring_status" | "lease_until">, now = Date.now()): boolean {
  const leased = book.lease_until !== null && Date.parse(book.lease_until) > now;
  if (leased) return false;
  return (
    PREVIEW.includes(book.status) ||
    PAID.includes(book.status) ||
    (book.status === "completed" && (book.coloring_status === "paid" || book.coloring_status === "generating"))
  );
}

async function claimLease(bookId: string): Promise<boolean> {
  const { data, error } = await db().rpc("claim_book_lease", { p_book_id: bookId, p_seconds: LEASE_SECONDS });
  if (error) throw new Error(`lease claim failed: ${error.message}`);
  return data === true;
}

const releaseLease = (bookId: string, retryInSeconds = 0) =>
  updateBook(bookId, { lease_until: retryInSeconds ? new Date(Date.now() + retryInSeconds * 1000).toISOString() : null });

type Step = "preview" | "pages" | "pdf" | "coloring" | "done";

function nextStep(book: BookRow): Step {
  if (PREVIEW.includes(book.status)) return "preview";
  if (book.status === "paid" || book.status === "generating_images") return "pages";
  if (book.status === "building_pdf") return "pdf";
  if (book.status === "completed" && (book.coloring_status === "paid" || book.coloring_status === "generating")) return "coloring";
  return "done";
}

export async function advanceBook(bookId: string): Promise<void> {
  if (!(await claimLease(bookId))) return;
  const deadline = Date.now() + BUDGET_MS;
  let retryIn = 0;
  try {
    for (let guard = 0; guard < 10 && Date.now() < deadline; guard++) {
      const book = await findBook(bookId);
      if (!book) return;
      const step = nextStep(book);
      if (step === "done") return;
      try {
        const finished = await STEPS[step](book, deadline);
        if (!finished) return;
      } catch (error) {
        retryIn = await recordFailure(book, step, error);
        return;
      }
    }
  } finally {
    await releaseLease(bookId, retryIn).catch((error) => console.error(`lease release failed for ${bookId}`, error));
  }
}

// Unexpected errors (provider outage, storage hiccup) back off and retry; a book that keeps failing
// stops in a terminal state the customer and the admin can see.
async function recordFailure(book: BookRow, step: Step, error: unknown): Promise<number> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
  console.error(`book ${book.id} step ${step} failed (attempt ${book.attempts + 1})`, message);
  const attempts = book.attempts + 1;
  if (attempts < MAX_BOOK_ATTEMPTS) {
    await updateBook(book.id, { attempts, status_detail: message });
    return RETRY_BACKOFF_SECONDS * attempts;
  }
  if (step === "preview") await transition(book.id, PREVIEW, "preview_failed", { attempts, status_detail: message });
  else if (step === "coloring") await updateBook(book.id, { attempts, coloring_status: "failed", status_detail: message });
  else await transition(book.id, PAID, "failed", { attempts, status_detail: message });
  return 0;
}

// Each step returns true when it moved the book forward and the loop may continue.
const STEPS: Record<Exclude<Step, "done">, (book: BookRow, deadline: number) => Promise<boolean>> = {
  preview: runPreview,
  pages: runPages,
  pdf: runPdf,
  coloring: runColoring,
};

async function runPreview(book: BookRow): Promise<boolean> {
  await transition(book.id, ["preview_pending"], "preview_generating");
  const input = { ...inputOf(book), language: "pt-BR" as const };
  const photo = book.photo_path && !book.photo_deleted_at ? await getFile(BUCKETS.uploads, book.photo_path) : null;

  let character = book.character_json;
  let story = storyOf(book);
  if (!character || !story) {
    if (!character && !photo) throw new Error("photo is gone before the character was read");
    const [reading, generated] = await Promise.all([
      character ? null : describeCharacter(book.id, photo!, input),
      story ? null : generateStory(book.id, input),
    ]);
    if (reading && !reading.usable) {
      await rejectPhoto(book, reading.problem === "none" ? "face_not_visible" : reading.problem);
      return false;
    }
    if (reading) character = buildCharacter(reading, input, book.id);
    if (generated) story = generated.story;
    await updateBook(book.id, { character_json: character, story_json: story });
  }

  const [cover] = await ensureAssets(book.id, "cover", [0]);
  if (cover.status !== "ready") {
    const prompt = coverPrompt(character!, input, story!.coverPrompt, story!.companionLook);
    const hint = { theme: book.theme, label: story!.title };
    let image: Buffer;
    try {
      image = await generateIllustration(book.id, { operation: "cover", prompt, aspect: "3:4", references: photo ? [photo] : [], hint });
    } catch (error) {
      // Some providers refuse to restyle a real child's photo. The written description still gives
      // a consistent character, and every page then follows the illustrated cover.
      if (!(error instanceof ContentBlockedError) || !photo) throw error;
      console.warn(`cover with photo reference blocked for ${book.id}, retrying from the description`);
      image = await generateIllustration(book.id, { operation: "cover", prompt, aspect: "3:4", references: [], hint });
    }
    const path = paths.asset(book.id, "cover", 0);
    await putFile(BUCKETS.assets, path, image, "image/jpeg");
    await markAsset(cover.id, { status: "ready", storage_path: path });
    await updateBook(book.id, { cover_path: path });
  }

  await deletePhoto(book);
  const now = new Date().toISOString();
  if (await transition(book.id, PREVIEW, "preview_ready", { preview_ready_at: now, attempts: 0, status_detail: null })) {
    await recordEvent(book.id, "preview_generated", book.id, { theme: book.theme });
  }
  return false;
}

async function rejectPhoto(book: BookRow, problem: PhotoProblem) {
  await deletePhoto(book);
  await transition(book.id, PREVIEW, "photo_rejected", { status_detail: problem });
}

// The original photo is needed only for the character reading and the cover. Deleting it here,
// seconds after upload, is the main privacy guarantee; the cron catches anything left behind.
export async function deletePhoto(book: Pick<BookRow, "id" | "photo_path" | "photo_deleted_at">) {
  if (!book.photo_path || book.photo_deleted_at) return;
  await removeFiles(BUCKETS.uploads, [book.photo_path]);
  await updateBook(book.id, { photo_deleted_at: new Date().toISOString() });
}

async function ensureAssets(bookId: string, type: AssetType, pages: number[]): Promise<AssetRow[]> {
  const { error } = await assets().upsert(
    pages.map((page_number) => ({ book_id: bookId, type, page_number })),
    { onConflict: "book_id,type,page_number", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
  const rows = await listAssets(bookId, type);
  return pages.map((p) => rows.find((r) => r.page_number === p)!);
}

async function markAsset(id: string, change: Record<string, unknown>) {
  const { error } = await assets().update({ ...change, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

const pageNumbers = Array.from({ length: PAGE_COUNT }, (_, i) => i + 1);

// Runs tasks with a fixed number in flight and stops starting new ones after the deadline.
async function pool<T>(items: T[], size: number, deadline: number, run: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length && Date.now() < deadline) await run(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

// Generates one image per pending asset. A failing page is retried on its own, up to a limit, and
// never blocks the rest of the book.
async function generateAssets(
  bookId: string,
  rows: AssetRow[],
  deadline: number,
  make: (row: AssetRow) => Promise<{ image: Buffer; contentType: string }>,
): Promise<void> {
  const pending = rows.filter((r) => r.status === "pending" && r.attempts < MAX_ASSET_ATTEMPTS);
  await pool(pending, env().IMAGE_CONCURRENCY, deadline, async (row) => {
    try {
      const { image, contentType } = await make(row);
      const path = paths.asset(bookId, row.type, row.page_number);
      await putFile(BUCKETS.assets, path, image, contentType);
      await markAsset(row.id, { status: "ready", storage_path: path, attempts: row.attempts + 1, last_error: null });
    } catch (error) {
      const attempts = row.attempts + 1;
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
      console.error(`asset ${row.type} ${row.page_number} of ${bookId} failed (attempt ${attempts})`, message);
      const giveUp = attempts >= MAX_ASSET_ATTEMPTS || error instanceof ContentBlockedError;
      await markAsset(row.id, { status: giveUp ? "failed" : "pending", attempts, last_error: message });
    }
  });
}

const unfinished = (rows: AssetRow[]) => rows.some((r) => r.status === "pending" && r.attempts < MAX_ASSET_ATTEMPTS);

async function runPages(book: BookRow, deadline: number): Promise<boolean> {
  if (await transition(book.id, ["paid"], "generating_images")) {
    await recordEvent(book.id, "book_generation_started", book.id);
  }
  const story = storyOf(book);
  if (!story || !book.character_json || !book.cover_path) throw new Error("paid book is missing its preview");
  const input = inputOf(book);
  const cover = await getFile(BUCKETS.assets, book.cover_path);
  const rows = await ensureAssets(book.id, "page", pageNumbers);

  await generateAssets(book.id, rows, deadline, async (row) => {
    const page = story.pages[row.page_number - 1];
    const image = await generateIllustration(book.id, {
      operation: "page",
      prompt: pagePrompt(book.character_json!, input, page.illustrationPrompt, story.companionLook),
      aspect: "4:3",
      references: [cover],
      hint: { theme: book.theme, label: `Página ${row.page_number}` },
    });
    return { image, contentType: "image/jpeg" };
  });

  if (unfinished(await listAssets(book.id, "page"))) return Date.now() < deadline;
  return transition(book.id, ["generating_images"], "building_pdf");
}

async function loadImages(bookId: string, type: AssetType): Promise<Map<number, Buffer>> {
  const ready = (await listAssets(bookId, type)).filter((r) => r.status === "ready" && r.storage_path);
  const files = await Promise.all(ready.map(async (r) => [r.page_number, await getFile(BUCKETS.assets, r.storage_path!)] as const));
  return new Map(files);
}

async function runPdf(book: BookRow): Promise<boolean> {
  const story = storyOf(book);
  if (!story || !book.cover_path) throw new Error("book is missing its story or cover");
  const [cover, pages] = await Promise.all([getFile(BUCKETS.assets, book.cover_path), loadImages(book.id, "page")]);
  const pdf = await generateBookPdf({ story, theme: book.theme, childName: book.child_first_name, childAge: book.child_age, cover, pages });
  const path = paths.bookPdf(book.id);
  await putFile(BUCKETS.books, path, pdf, "application/pdf");
  const done = await transition(book.id, ["building_pdf"], "completed", {
    pdf_path: path,
    completed_at: new Date().toISOString(),
    attempts: 0,
    status_detail: null,
  });
  if (done) await recordEvent(book.id, "book_completed", book.id, { missing_pages: PAGE_COUNT - pages.size });
  return done;
}

async function runColoring(book: BookRow, deadline: number): Promise<boolean> {
  await db().from("books").update({ coloring_status: "generating" }).eq("id", book.id).eq("coloring_status", "paid");
  const story = storyOf(book);
  if (!story) throw new Error("book is missing its story");
  const pages = await loadImages(book.id, "page");
  const rows = await ensureAssets(book.id, "coloring", [...pages.keys()].sort((a, b) => a - b));

  await generateAssets(book.id, rows, deadline, async (row) => {
    const source = pages.get(row.page_number)!;
    try {
      const image = await generateIllustration(book.id, {
        operation: "coloring",
        prompt: COLORING_PROMPT,
        aspect: "4:3",
        references: [source],
        hint: { theme: book.theme, label: `Colorir ${row.page_number}` },
      });
      return { image, contentType: "image/png" };
    } catch (error) {
      // The last attempt falls back to local edge detection: the customer paid for a coloring book.
      if (row.attempts + 1 < MAX_ASSET_ATTEMPTS && !(error instanceof ContentBlockedError)) throw error;
      return { image: await lineArt(source), contentType: "image/png" };
    }
  });

  const coloringRows = await listAssets(book.id, "coloring");
  if (unfinished(coloringRows)) return Date.now() < deadline;

  const images = await loadImages(book.id, "coloring");
  const pdf = await generateColoringPdf({ story, theme: book.theme, childName: book.child_first_name, childAge: book.child_age, pages: images });
  const path = paths.coloringPdf(book.id);
  await putFile(BUCKETS.books, path, pdf, "application/pdf");
  await updateBook(book.id, {
    coloring_status: "completed",
    coloring_pdf_path: path,
    coloring_completed_at: new Date().toISOString(),
    attempts: 0,
  });
  return false;
}

// Called by syncPayment for every approved payment, any number of times.
export async function onPaymentApproved(bookId: string, product: Product): Promise<void> {
  const now = new Date().toISOString();
  if (product === "book") {
    await transition(bookId, ["preview_ready"], "paid", { paid_at: now, attempts: 0 });
  } else {
    await db()
      .from("books")
      .update({ coloring_status: "paid", coloring_paid_at: now, updated_at: now })
      .eq("id", bookId)
      .in("coloring_status", ["none"]);
  }
  after(() => advanceBook(bookId));
}

// A paid book whose pages exhausted their retries can be pushed through again from the admin or a
// support request: failed assets go back to pending and the book resumes.
export async function retryBook(bookId: string): Promise<void> {
  const book = await findBook(bookId);
  if (!book) return;
  await assets().update({ status: "pending", attempts: 0 }).eq("book_id", bookId).eq("status", "failed");
  if (book.status === "failed") await transition(bookId, ["failed"], "generating_images", { attempts: 0 });
  if (book.status === "preview_failed") await transition(bookId, ["preview_failed"], "preview_pending", { attempts: 0 });
  if (book.coloring_status === "failed") await updateBook(bookId, { coloring_status: "paid", attempts: 0 });
  await advanceBook(bookId);
}
