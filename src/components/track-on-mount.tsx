"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics/client";
import type { EventName } from "@/lib/analytics/events";

// Fires once per mount. The ref survives React's dev-only double effect run.
export function TrackOnMount({
  event,
  token,
  properties = {},
}: {
  event: EventName;
  token?: string;
  properties?: Record<string, string | number | boolean>;
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackEvent(event, properties, { token });
    // properties is a fresh object each render; the ref already limits this to the first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, token]);
  return null;
}
