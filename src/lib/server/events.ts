import "server-only";
import type { EventName } from "@/lib/analytics/events";
import { db } from "./supabase";

// Server-side funnel events. The (event_name, event_id) unique index makes each one idempotent.
export async function recordEvent(
  bookId: string,
  name: EventName,
  eventId: string,
  properties: Record<string, string | number | boolean> = {},
): Promise<void> {
  const { error } = await db()
    .from("events")
    .upsert(
      { book_id: bookId, event_name: name, event_id: eventId, properties: { source: "server", ...properties } },
      { onConflict: "event_name,event_id", ignoreDuplicates: true },
    );
  if (error) console.error(`event ${name} insert failed`, error.message);
}
