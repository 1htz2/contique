"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { captureAttribution, getVisitorId } from "@/lib/attribution";

export function AttributionCapture() {
  const pathname = usePathname();
  useEffect(() => {
    captureAttribution();
    getVisitorId();
  }, [pathname]);
  return null;
}
