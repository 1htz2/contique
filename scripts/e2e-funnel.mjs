// Drives the whole funnel in a real browser at phone size against `pnpm dev`, with the template and
// mock providers. Payment is simulated in the database (no Mercado Pago call), everything else is
// the real app. Usage: node scripts/e2e-funnel.mjs [baseUrl] [outDir]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import sharp from "sharp";

process.loadEnvFile(".env.local");
const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? "/tmp/contique-e2e";
mkdirSync(out, { recursive: true });

const rest = async (path, init = {}) => {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      prefer: "return=representation",
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
};

const photo = `${out}/foto.jpg`;
// Random texture: a flat color compresses below the server's minimum photo size.
const noise = Buffer.from(Array.from({ length: 900 * 1100 * 3 }, (_, i) => 120 + ((i * 2654435761) % 97)));
await sharp(noise, { raw: { width: 900, height: 1100, channels: 3 } }).jpeg({ quality: 90 }).toFile(photo);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const shot = (name) => page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
const step = (label) => console.log(`- ${label}`);

step("landing");
await page.goto(`${base}/?utm_source=teste&utm_campaign=e2e`);
await page.getByRole("heading", { level: 1 }).waitFor();
await shot("01-landing");
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
if (overflow) throw new Error("landing scrolls horizontally");

step("child info");
await page.getByRole("link", { name: "CRIAR MINHA HISTÓRIA" }).first().click();
await page.waitForURL("**/criar**");
await page.getByRole("button", { name: "CONTINUAR" }).click();
await page.getByText("Digite").first().waitFor();
await shot("02-validation");
await page.getByPlaceholder("Ex.: Lucas").fill("João Pedro");
await page.getByRole("button", { name: "6", exact: true }).click();
await page.getByRole("button", { name: "Ele", exact: true }).click();
await shot("03-child");
await page.getByRole("button", { name: "CONTINUAR" }).click();

step("photo");
await page.getByText("Confirmo que sou responsável").waitFor();
await page.getByRole("checkbox").check();
await page.locator('input[type=file]:not([capture])').setInputFiles(photo);
await page.getByText("Foto pronta").waitFor();
await shot("04-photo");
await page.getByRole("button", { name: "CONTINUAR" }).click();

step("theme");
await page.getByRole("radio", { name: /Dinossauros/ }).click();
await shot("05-theme");
await page.getByRole("button", { name: "CONTINUAR" }).click();

step("details");
await page.getByPlaceholder("Ex.: dinossauros, futebol, astronomia").fill("futebol, astronomia");
await page.getByRole("button", { name: "Curiosa" }).click();
await page.getByRole("button", { name: "Corajosa" }).click();
await page.getByRole("button", { name: "Pet" }).click();
await page.getByRole("button", { name: "Cachorro" }).click();
await page.getByPlaceholder("Só o nome").fill("Bolinha");
await shot("06-details");
await page.getByRole("button", { name: "VER A CAPA DO LIVRO" }).click();

step("preview");
await page.waitForURL("**/livro/**");
const token = page.url().split("/livro/")[1];
await page.getByRole("heading", { name: "A aventura de João Pedro está pronta para continuar." }).waitFor({ timeout: 90_000 });
await page.waitForTimeout(600);
await shot("07-preview");

const [book] = await rest(`books?token=eq.${token}&select=id,status,photo_deleted_at,utm_source,utm_campaign`);
if (!book.photo_deleted_at) throw new Error("photo was not deleted after the preview");
if (book.utm_campaign !== "e2e") throw new Error(`utm not stored: ${JSON.stringify(book)}`);

step("simulated payment");
await rest("payments", {
  method: "POST",
  body: JSON.stringify({ book_id: book.id, product: "book", method: "pix", amount: 14.9, status: "approved", idempotency_key: crypto.randomUUID(), approved_at: new Date().toISOString(), live_mode: false }),
});
await rest(`books?id=eq.${book.id}`, { method: "PATCH", body: JSON.stringify({ status: "paid", paid_at: new Date().toISOString() }) });
await page.reload();
await page.getByRole("heading", { name: "Estamos criando a aventura de João Pedro…" }).waitFor();
await shot("08-generating");
await page.getByRole("link", { name: "BAIXAR PDF" }).waitFor({ timeout: 120_000 });
await page.waitForTimeout(600);
await shot("09-completed");

step("download");
const download = await page.request.get(`${base}/api/books/${token}/download`, { maxRedirects: 0 });
if (download.status() !== 302 || !download.headers().location.includes("token=")) throw new Error(`download ${download.status()}`);

step("reader");
await page.getByRole("link", { name: "VER LIVRO" }).click();
await page.getByText("Esta história foi criada especialmente para João Pedro.", { exact: true }).last().waitFor();
await shot("10-reader");
await page.goBack();

step("coloring upsell (simulated payment)");
await rest(`books?id=eq.${book.id}`, { method: "PATCH", body: JSON.stringify({ coloring_status: "paid" }) });
await page.reload();
await page.getByRole("link", { name: "BAIXAR LIVRO PARA COLORIR" }).waitFor({ timeout: 120_000 });
await shot("11-coloring-done");

await browser.close();
if (errors.length) console.log("browser errors:", errors);
console.log(`PASS ${token}\nscreenshots in ${out}`);
