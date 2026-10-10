import type { BookView, ColoringStatus } from "@/lib/domain/book";

export const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "ttclid",
] as const;
export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];
export type Attribution = Partial<Record<AttributionKey | "fbp" | "fbc" | "landing_path", string>>;

// Sent as multipart form data: the JPEG under `photo`, this object as JSON under `payload`.
export type CreateBookPayload = {
  visitorId: string;
  consent: true;
  attribution: Attribution;
  input: unknown;
};
export type CreateBookResponse = { token: string };

// Polled by the book page. Never carries the photo or signed URLs: the page itself renders those.
export type BookStatusResponse = {
  view: BookView;
  status: string;
  coloring: ColoringStatus;
  // 0..1 progress of the paid generation, for the progress bar.
  progress: number;
};

export type Product = "book" | "coloring";
export type PixCheckoutRequest = { token: string; product: Product };
export type PixCheckoutResponse = {
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string;
  expiresAt: string;
  amount: number;
};

export type CardCheckoutRequest = { token: string; product: Product; formData: unknown };

export type PaymentStatus = "none" | "pending" | "approved" | "rejected" | "expired";
export type PaymentStatusResponse =
  | { status: Exclude<PaymentStatus, "approved"> }
  | { status: "approved"; purchaseEventId: string; value: number; currency: "BRL" };

export type ApiError = { error: string };
