// Writes .env.local for local development against `supabase start`. AI and payment credentials
// stay empty: without them the app uses template stories, mock illustrations and no checkout.
import { existsSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const target = new URL("../.env.local", import.meta.url);
if (existsSync(target) && !process.argv.includes("--force")) {
  console.log("já existe; use --force para sobrescrever");
  process.exit(0);
}

const status = Object.fromEntries(
  execSync("pnpm exec supabase status -o env", { cwd: new URL("..", import.meta.url) })
    .toString()
    .split("\n")
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);

const values = {
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  SUPABASE_URL: status.API_URL,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  BOOK_PRICE_BRL: "14.90",
  COLORING_BOOK_PRICE_BRL: "6.90",
  TEXT_AI_PROVIDER: "template",
  IMAGE_AI_PROVIDER: "mock",
  ADMIN_USER: "admin",
  ADMIN_PASSWORD: "contique-local-admin",
  CRON_SECRET: "local-cron-secret-0123456789",
};

const lines = Object.entries(values).map(([k, v]) => `${k}=${v ?? ""}`);
lines.push(
  "",
  "# IA de verdade: TEXT_AI_PROVIDER=anthropic + ANTHROPIC_API_KEY, IMAGE_AI_PROVIDER=gemini + GEMINI_API_KEY",
  "ANTHROPIC_API_KEY=",
  "GEMINI_API_KEY=",
  "# Mercado Pago: cole as credenciais de teste à mão (veja .env.example)",
);
writeFileSync(target, lines.join("\n") + "\n");
console.log(`ok: supabase em ${values.SUPABASE_URL}, service role ${values.SUPABASE_SERVICE_ROLE_KEY ? "presente" : "AUSENTE"}`);
