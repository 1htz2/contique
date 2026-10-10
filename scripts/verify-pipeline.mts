// End-to-end check of the book pipeline against the local Supabase, with the template text provider
// and the mock image provider. Run: pnpm verify:pipeline
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { imageProvider } from "../src/lib/server/ai/index";
import { assets, books, findBook, listAssets, newBookToken } from "../src/lib/server/books";
import { advanceBook } from "../src/lib/server/pipeline";
import { BUCKETS, getFile, listFolder, paths, putFile } from "../src/lib/server/storage";
import { db } from "../src/lib/server/supabase";

const out = process.argv[2] ?? "/tmp/contique-verify";
mkdirSync(out, { recursive: true });

async function createBook(name: string) {
  const id = crypto.randomUUID();
  const photo = await sharp({ create: { width: 900, height: 900, channels: 3, background: "#d9a07a" } }).jpeg().toBuffer();
  await putFile(BUCKETS.uploads, paths.photo(id), photo, "image/jpeg");
  const { error } = await books().insert({
    id,
    token: newBookToken(),
    consent_at: new Date().toISOString(),
    child_first_name: name,
    child_age: 6,
    child_pronoun: "ele",
    theme: "dinossauros",
    interests: "futebol, astronomia",
    traits: ["curiosa", "corajosa"],
    companion_json: { kind: "pet", name: "Bolinha", petKind: "cachorro" },
    photo_path: paths.photo(id),
  });
  if (error) throw new Error(error.message);
  return id;
}

const usageCount = async (bookId: string, operation: string) =>
  (await db().from("ai_usage").select("id", { count: "exact", head: true }).eq("book_id", bookId).eq("operation", operation)).count;

// Page 3 fails every time (it must ship as a placeholder); page 5 fails once (it must recover).
const provider = imageProvider();
const original = provider.generate.bind(provider);
const failures = new Map<string, number>();
(provider as { generate: typeof provider.generate }).generate = async (request) => {
  const n = (failures.get(request.hint.label) ?? 0) + 1;
  failures.set(request.hint.label, n);
  if (request.hint.label === "Página 3") throw new Error("simulated outage on page 3");
  if (request.hint.label === "Página 5" && n === 1) throw new Error("simulated blip on page 5");
  return original(request);
};

const id = await createBook("João Pedro");

// Two concurrent workers: the lease must let only one generate.
await Promise.all([advanceBook(id), advanceBook(id)]);
let book = (await findBook(id))!;
assert.equal(book.status, "preview_ready", `preview status ${book.status} ${book.status_detail}`);
assert.ok(book.photo_deleted_at, "photo deleted after preview");
assert.equal((await listFolder(BUCKETS.uploads, "")).filter((f) => f.name.startsWith(id)).length, 0, "photo gone from bucket");
assert.ok(book.cover_path, "cover stored");
assert.equal(await usageCount(id, "cover"), 1, "cover generated exactly once despite two workers");
console.log("preview ok:", (book.story_json as { title: string }).title);

// Payment approval moves the book to paid (onPaymentApproved needs a request scope for after()).
await books().update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id);
await advanceBook(id);
book = (await findBook(id))!;
assert.equal(book.status, "completed", `paid status ${book.status} ${book.status_detail}`);
const pages = await listAssets(id, "page");
assert.equal(pages.length, 10);
assert.equal(pages.find((p) => p.page_number === 3)?.status, "failed", "page 3 gave up after retries");
assert.equal(pages.find((p) => p.page_number === 3)?.attempts, 3);
assert.equal(pages.find((p) => p.page_number === 5)?.status, "ready", "page 5 recovered on retry");
assert.equal(pages.filter((p) => p.status === "ready").length, 9);
const pdf = await getFile(BUCKETS.books, book.pdf_path!);
writeFileSync(`${out}/livro.pdf`, pdf);
console.log("book ok:", `${(pdf.length / 1024).toFixed(0)} KB`);

// Running again changes nothing.
const before = await usageCount(id, "page");
await advanceBook(id);
assert.equal(await usageCount(id, "page"), before, "a completed book is never regenerated");

await books().update({ coloring_status: "paid" }).eq("id", id);
await advanceBook(id);
book = (await findBook(id))!;
assert.equal(book.coloring_status, "completed", `coloring ${book.coloring_status} ${book.status_detail}`);
const coloring = await getFile(BUCKETS.books, book.coloring_pdf_path!);
writeFileSync(`${out}/livro-para-colorir.pdf`, coloring);
assert.equal((await listAssets(id, "coloring")).length, 9, "one coloring page per illustrated page");
console.log("coloring ok:", `${(coloring.length / 1024).toFixed(0)} KB`);

await assets().delete().eq("book_id", id);
console.log(`PASS. PDFs in ${out}`);
