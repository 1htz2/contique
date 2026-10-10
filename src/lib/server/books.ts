import "server-only";
import { randomBytes } from "node:crypto";
import type { BookInput, Companion } from "@/lib/domain/book-input";
import { Story, type BookStatus, type ColoringStatus } from "@/lib/domain/book";
import type { CharacterSheet } from "./ai/character";
import { db } from "./supabase";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const isBookToken = (token: string) => TOKEN_PATTERN.test(token);
export const newBookToken = () => randomBytes(32).toString("base64url");

export type BookRow = {
  id: string;
  token: string;
  status: BookStatus;
  status_detail: string | null;
  visitor_id: string | null;
  child_first_name: string;
  child_nickname: string | null;
  child_age: number;
  child_pronoun: BookInput["pronoun"];
  theme: string;
  interests: string | null;
  traits: string[];
  companion_json: Companion | null;
  story_json: unknown;
  character_json: CharacterSheet | null;
  photo_path: string | null;
  photo_deleted_at: string | null;
  cover_path: string | null;
  pdf_path: string | null;
  coloring_status: ColoringStatus;
  coloring_pdf_path: string | null;
  lease_until: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  completed_at: string | null;
};

export type AssetType = "cover" | "page" | "coloring";
export type AssetRow = {
  id: string;
  book_id: string;
  type: AssetType;
  page_number: number;
  storage_path: string | null;
  status: "pending" | "ready" | "failed";
  attempts: number;
};

const COLUMNS =
  "id, token, status, status_detail, visitor_id, child_first_name, child_nickname, child_age, child_pronoun, theme, interests, traits, companion_json, story_json, character_json, photo_path, photo_deleted_at, cover_path, pdf_path, coloring_status, coloring_pdf_path, lease_until, attempts, created_at, updated_at, paid_at, completed_at";

export const books = () => db().from("books");
export const assets = () => db().from("assets");

export async function findBookByToken(token: string): Promise<BookRow | null> {
  if (!isBookToken(token)) return null;
  const { data, error } = await books().select(COLUMNS).eq("token", token).maybeSingle<BookRow>();
  if (error) throw new Error(error.message);
  return data;
}

export async function findBook(id: string): Promise<BookRow | null> {
  const { data, error } = await books().select(COLUMNS).eq("id", id).maybeSingle<BookRow>();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateBook(id: string, change: Record<string, unknown>): Promise<void> {
  const { error } = await books().update({ ...change, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

// Moves status only from one of the expected states, so a late or duplicate worker never drags a
// book backwards (for example from completed back to generating).
export async function transition(id: string, from: BookStatus[], to: BookStatus, extra: Record<string, unknown> = {}) {
  const { data, error } = await books()
    .update({ status: to, updated_at: new Date().toISOString(), ...extra })
    .eq("id", id)
    .in("status", from)
    .select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export async function listAssets(bookId: string, type?: AssetType): Promise<AssetRow[]> {
  let query = assets().select("id, book_id, type, page_number, storage_path, status, attempts").eq("book_id", bookId);
  if (type) query = query.eq("type", type);
  const { data, error } = await query.order("page_number");
  if (error) throw new Error(error.message);
  return (data ?? []) as AssetRow[];
}

// Rebuilds the validated input from the stored row: the pipeline never trusts anything else.
export function inputOf(book: BookRow): BookInput {
  return {
    childFirstName: book.child_first_name,
    childNickname: book.child_nickname ?? undefined,
    childAge: book.child_age,
    pronoun: book.child_pronoun,
    theme: book.theme as BookInput["theme"],
    interests: book.interests ?? undefined,
    traits: book.traits as BookInput["traits"],
    companion: book.companion_json ?? { kind: "none" },
  };
}

export function storyOf(book: Pick<BookRow, "story_json">) {
  const parsed = Story.safeParse(book.story_json);
  return parsed.success ? parsed.data : null;
}

export async function isPaid(bookId: string, product: "book" | "coloring"): Promise<boolean> {
  const { count, error } = await db()
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("book_id", bookId)
    .eq("product", product)
    .eq("status", "approved");
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

// A charge for a product the book cannot receive yet is refused, so nobody pays for a book whose
// preview failed or for a coloring book before the book exists.
export const canBuy = (book: BookRow, product: "book" | "coloring") =>
  product === "book" ? book.status === "preview_ready" : book.status === "completed" && book.coloring_status === "none";
