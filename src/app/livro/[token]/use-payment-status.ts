"use client";

import { useEffect, useEffectEvent } from "react";
import type { PaymentStatusResponse, Product } from "@/lib/contracts";

const POLL_MS = 3000;

// Polls while active, pauses while the tab is hidden, and re-checks immediately on return:
// people leave to open their bank app and come back.
export function usePaymentStatus(
  token: string,
  product: Product,
  active: boolean,
  onStatus: (status: PaymentStatusResponse) => void,
) {
  const report = useEffectEvent(onStatus);

  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let inFlight = false;

    async function check() {
      clearTimeout(timer);
      if (stopped || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const res = await fetch(`/api/payment/status?token=${encodeURIComponent(token)}&product=${product}`, { cache: "no-store" });
        if (res.ok && !stopped) report((await res.json()) as PaymentStatusResponse);
      } catch {
      } finally {
        inFlight = false;
        if (!stopped) timer = setTimeout(check, POLL_MS);
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    timer = setTimeout(check, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [token, product, active]);
}
