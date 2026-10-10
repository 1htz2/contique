export const EVENTS = [
  "landing_view",
  "create_started",
  "child_info_completed",
  "photo_uploaded",
  "theme_selected",
  "personalization_completed",
  "preview_generated",
  "paywall_viewed",
  "checkout_started",
  "pix_generated",
  "payment_approved",
  "book_generation_started",
  "book_completed",
  "book_viewed",
  "pdf_downloaded",
  "share_clicked",
  "coloring_upsell_viewed",
  "coloring_checkout_started",
  "coloring_upsell_purchased",
  "data_deleted",
] as const;
export type EventName = (typeof EVENTS)[number];

export type StandardEvent = "PageView" | "ViewContent" | "Lead" | "InitiateCheckout" | "AddPaymentInfo" | "Purchase";

// Internal events that map to an ad-platform standard event. Everything else stays in our own
// database, so ad platforms optimize on the few signals that matter.
export const STANDARD_EVENT: Partial<Record<EventName, StandardEvent>> = {
  landing_view: "PageView",
  paywall_viewed: "ViewContent",
  checkout_started: "InitiateCheckout",
  pix_generated: "AddPaymentInfo",
  payment_approved: "Purchase",
  coloring_upsell_purchased: "Purchase",
};

export const TIKTOK_EVENT: Partial<Record<StandardEvent, string>> = {
  ViewContent: "ViewContent",
  Lead: "SubmitForm",
  InitiateCheckout: "InitiateCheckout",
  AddPaymentInfo: "AddPaymentInfo",
  Purchase: "CompletePayment",
};

export type EventPayload = {
  name: EventName;
  eventId: string;
  visitorId: string;
  token?: string;
  properties?: Record<string, string | number | boolean>;
};
