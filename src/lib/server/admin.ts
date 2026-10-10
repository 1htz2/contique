import "server-only";
import { books } from "./books";
import { db } from "./supabase";

export const PERIODS = { hoje: "Hoje", "7d": "7 dias", "30d": "30 dias", tudo: "Tudo" } as const;
export type Period = keyof typeof PERIODS;

export const parsePeriod = (value: unknown): Period =>
  typeof value === "string" && value in PERIODS ? (value as Period) : "7d";

function since(period: Period, now = new Date()): Date {
  switch (period) {
    case "hoje": {
      const today = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      return new Date(`${today}T00:00:00-03:00`);
    }
    case "7d":
      return new Date(now.getTime() - 7 * 86_400_000);
    case "30d":
      return new Date(now.getTime() - 30 * 86_400_000);
    case "tudo":
      return new Date(0);
  }
}

type Breakdown = { key: string; sales: number; revenue: number }[];

export type AdminMetrics = {
  visitors: number;
  create_started: number;
  photo_uploaded: number;
  books_created: number;
  photo_rejected: number;
  preview_generated: number;
  paywall_viewed: number;
  checkout_started: number;
  pix_generated: number;
  books_sold: number;
  books_completed: number;
  books_failed: number;
  pdf_downloaded: number;
  coloring_viewed: number;
  coloring_sold: number;
  revenue: number;
  avg_ticket: number | null;
  visitor_to_sale: number | null;
  preview_to_sale: number | null;
  checkout_to_sale: number | null;
  ai_cost_usd: number;
  ai_preview_cost_usd: number;
  ai_pages_cost_usd: number;
  ai_coloring_cost_usd: number;
  avg_paid_book_ai_cost_usd: number | null;
  by_source: Breakdown;
  by_campaign: Breakdown;
  by_content: Breakdown;
  themes: { key: string; books: number; sold: number }[];
};

export type RecentSale = {
  approved_at: string;
  amount: number;
  method: "pix" | "card";
  product: "book" | "coloring";
  books: { utm_source: string | null; utm_campaign: string | null; theme: string } | null;
};

export type StuckBook = { id: string; status: string; coloring_status: string; status_detail: string | null; updated_at: string };

// No child names, photos or illustrations here: the dashboard only needs counts and money.
export async function loadDashboard(period: Period) {
  const from = since(period).toISOString();
  const [metrics, sales, stuck] = await Promise.all([
    db().rpc("admin_metrics", { p_since: from }),
    db()
      .from("payments")
      .select("approved_at, amount, method, product, books(utm_source, utm_campaign, theme)")
      .eq("status", "approved")
      .or("live_mode.is.null,live_mode.eq.true")
      .gte("approved_at", from)
      .order("approved_at", { ascending: false })
      .limit(30),
    books()
      .select("id, status, coloring_status, status_detail, updated_at")
      .or("status.eq.failed,coloring_status.eq.failed,status.eq.preview_failed")
      .order("updated_at", { ascending: false })
      .limit(20),
  ]);
  if (metrics.error) throw new Error(metrics.error.message);
  if (sales.error) throw new Error(sales.error.message);
  if (stuck.error) throw new Error(stuck.error.message);
  return {
    metrics: metrics.data as AdminMetrics,
    sales: sales.data as unknown as RecentSale[],
    stuck: stuck.data as StuckBook[],
  };
}
