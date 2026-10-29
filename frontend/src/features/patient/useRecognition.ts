import { useEffect, useState } from "react";
import { api, ApiError } from "@/api/client";
import type { CurrentPerson } from "@/api/types";
import { FAILURES_BEFORE_UNAVAILABLE } from "./recognitionView";

/** Same cadence as the original patient page. */
export const POLL_INTERVAL_MS = 700;

export interface RecognitionFeed {
  detection: CurrentPerson | null;
  failures: number;
  unauthorized: boolean;
}

/**
 * Poll /api/current-person. Each request starts only after the previous one
 * finishes (no pile-up on a slow network), polling pauses while the page is
 * hidden, and everything is cancelled on unmount.
 */
export function useRecognition(active: boolean): RecognitionFeed {
  const [feed, setFeed] = useState<RecognitionFeed>({ detection: null, failures: 0, unauthorized: false });

  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let stopped = false;

    const tick = async () => {
      controller = new AbortController();
      try {
        const detection = await api.currentPerson(controller.signal);
        if (!stopped) setFeed({ detection, failures: 0, unauthorized: false });
      } catch (err) {
        if (stopped || (err as Error).name === "AbortError") return;
        const unauthorized = err instanceof ApiError && err.isUnauthorized;
        // Ride out a single blip, but once polls keep failing drop the last
        // detection: an identity we can no longer confirm must not stay up.
        setFeed((prev) => {
          const failures = prev.failures + 1;
          return {
            detection: failures >= FAILURES_BEFORE_UNAVAILABLE || unauthorized ? null : prev.detection,
            failures,
            unauthorized,
          };
        });
      }
      if (!stopped) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();

    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
    };
  }, [active]);

  return feed;
}
