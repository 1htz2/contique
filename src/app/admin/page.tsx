import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { themeOf } from "@/lib/domain/themes";
import { loadDashboard, parsePeriod, PERIODS } from "@/lib/server/admin";
import { isAdminAuthorized } from "@/lib/server/admin-auth";
import { env } from "@/lib/server/env";
import { retryBook } from "@/lib/server/pipeline";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const maxDuration = 300;

const brl = (value: number) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (value: number | null) =>
  value === null ? "–" : (value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
const usd = (value: number | null) =>
  value === null ? "–" : "US$ " + Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const parseSpend = (value: unknown) => {
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
const time = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

async function retry(formData: FormData) {
  "use server";
  if (!isAdminAuthorized((await headers()).get("authorization"))) return;
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  after(() => retryBook(id));
  revalidatePath("/admin");
}

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  // The proxy guards /admin; this re-check keeps the page safe if the matcher ever changes.
  if (!isAdminAuthorized((await headers()).get("authorization"))) notFound();

  const query = await searchParams;
  const period = parsePeriod(query.periodo);
  const spend = parseSpend(query.gasto);
  const { metrics: m, sales, stuck } = await loadDashboard(period);
  const rate = env().USD_BRL_RATE;
  const aiBrl = m.ai_cost_usd * rate;

  const funnel: [string, string][] = [
    ["Visitantes", String(m.visitors)],
    ["Criação iniciada", String(m.create_started)],
    ["Fotos enviadas", String(m.photo_uploaded)],
    ["Livros criados", String(m.books_created)],
    ["Fotos recusadas", String(m.photo_rejected)],
    ["Prévias geradas", String(m.preview_generated)],
    ["Paywalls vistos", String(m.paywall_viewed)],
    ["Checkouts", String(m.checkout_started)],
    ["Pix gerados", String(m.pix_generated)],
    ["Compras (livro)", String(m.books_sold)],
    ["Livros concluídos", String(m.books_completed)],
    ["PDFs baixados", String(m.pdf_downloaded)],
  ];

  const money: [string, string][] = [
    ["Receita", brl(m.revenue)],
    ["Ticket médio", m.avg_ticket === null ? "–" : brl(m.avg_ticket)],
    ["Visitante → compra", pct(m.visitor_to_sale)],
    ["Prévia → compra", pct(m.preview_to_sale)],
    ["Checkout → compra", pct(m.checkout_to_sale)],
    ["Upsells (colorir)", `${m.coloring_sold} de ${m.coloring_viewed} vistos`],
    ["CPA", spend && m.books_sold ? brl(spend / m.books_sold) : "–"],
    ["ROAS", spend ? (m.revenue / spend).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "x" : "–"],
  ];

  const ai: [string, string][] = [
    ["Custo de IA no período", `${usd(m.ai_cost_usd)} (${brl(aiBrl)})`],
    ["Receita menos IA", brl(m.revenue - aiBrl)],
    ["IA em prévias", usd(m.ai_preview_cost_usd)],
    ["IA em páginas", usd(m.ai_pages_cost_usd)],
    ["IA em livros para colorir", usd(m.ai_coloring_cost_usd)],
    ["IA média por livro pago", usd(m.avg_paid_book_ai_cost_usd)],
    ["IA por prévia", m.preview_generated ? usd(m.ai_preview_cost_usd / m.preview_generated) : "–"],
    ["Livros com falha", String(m.books_failed)],
  ];

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-neutral-100">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">Contique · Admin</h1>
          <nav className="flex gap-1 rounded-lg bg-neutral-900 p-1 text-sm">
            {(Object.keys(PERIODS) as (keyof typeof PERIODS)[]).map((key) => (
              <Link
                key={key}
                href={`/admin?periodo=${key}${spend ? `&gasto=${spend}` : ""}`}
                className={`rounded-md px-3 py-1.5 ${key === period ? "bg-neutral-100 text-neutral-950" : "text-neutral-400 hover:text-neutral-100"}`}
              >
                {PERIODS[key]}
              </Link>
            ))}
          </nav>
        </header>

        <form className="flex flex-wrap items-end gap-3 text-sm" action="/admin">
          <input type="hidden" name="periodo" value={period} />
          <label className="flex flex-col gap-1 text-neutral-400">
            Gasto em anúncios no período (R$), para CPA e ROAS
            <input name="gasto" inputMode="decimal" defaultValue={spend ?? ""} className="w-48 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-neutral-100" />
          </label>
          <button className="rounded-md bg-neutral-100 px-3 py-1.5 font-medium text-neutral-950">Calcular</button>
        </form>

        <Kpis title="Funil" items={funnel} />
        <Kpis title="Receita e conversão" items={money} />
        <Kpis title={`Custo de IA (câmbio US$ 1 = R$ ${rate.toLocaleString("pt-BR")})`} items={ai} />

        <div className="grid gap-6 md:grid-cols-2">
          <Breakdown title="Vendas por utm_campaign" rows={m.by_campaign} />
          <Breakdown title="Vendas por utm_content" rows={m.by_content} />
          <Breakdown title="Vendas por utm_source" rows={m.by_source} />
          <Table
            title="Temas mais escolhidos"
            head={["Tema", "Livros", "Vendidos", "Conversão"]}
            rows={m.themes.map((t) => [themeOf(t.key).name, String(t.books), String(t.sold), pct(t.books ? t.sold / t.books : null)])}
          />
        </div>

        <Table
          title="Últimas vendas"
          head={["Hora", "Produto", "Valor", "Método", "utm_source", "utm_campaign", "Tema"]}
          rows={sales.map((s) => [
            time(s.approved_at),
            s.product === "book" ? "Livro" : "Colorir",
            brl(s.amount),
            s.method === "pix" ? "Pix" : "Cartão",
            s.books?.utm_source ?? "(direto)",
            s.books?.utm_campaign ?? "(direto)",
            s.books ? themeOf(s.books.theme).name : "–",
          ])}
        />

        <section className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="text-sm font-medium text-neutral-300">Livros com falha</h2>
          {stuck.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">Nenhum.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {stuck.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 border-t border-neutral-800 pt-2">
                  <code className="text-neutral-400">{b.id.slice(0, 8)}</code>
                  <span>{b.status}{b.coloring_status === "failed" ? " · colorir falhou" : ""}</span>
                  <span className="text-neutral-500">{time(b.updated_at)}</span>
                  <span className="max-w-md truncate text-neutral-500">{b.status_detail}</span>
                  <form action={retry} className="ml-auto">
                    <input type="hidden" name="id" value={b.id} />
                    <button className="rounded-md bg-neutral-100 px-3 py-1 font-medium text-neutral-950">Tentar de novo</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function Kpis({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-neutral-300">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="text-xs text-neutral-400">{label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { key: string; sales: number; revenue: number }[] }) {
  return <Table title={title} head={["Origem", "Vendas", "Receita"]} rows={rows.map((r) => [r.key, String(r.sales), brl(r.revenue)])} />;
}

function Table({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <section className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900">
      <h2 className="px-4 pt-4 text-sm font-medium text-neutral-300">{title}</h2>
      <table className="mt-2 w-full text-left text-sm">
        <thead className="text-xs text-neutral-500">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-2 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="px-4 py-3 text-neutral-500">Nada no período.</td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="border-t border-neutral-800">
                {row.map((cell, j) => (
                  <td key={j} className="whitespace-nowrap px-4 py-2">{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
