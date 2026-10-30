import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/api/client";
import type { CurrentPerson } from "@/api/types";
import { FAILURES_BEFORE_UNAVAILABLE } from "./recognitionView";

/** Same cadence as the original patient page. */
export const POLL_INTERVAL_MS = 700;

/**
 * Same answer as far as the patient screen is concerned. `confidence` is
 * never shown and changes with almost every frame; comparing without it
 * lets an unchanged poll skip re-rendering the whole screen.
 */
export function sameDetection(a: CurrentPerson | null, b: CurrentPerson): boolean {
  return a !== null && JSON.stringify({ ...a, confidence: 0 }) === JSON.stringify({ ...b, confidence: 0 });
}

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
  const latest = useRef(feed);

  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let stopped = false;
    const publish = (next: RecognitionFeed) => {
      latest.current = next;
      setFeed(next);
    };

    const tick = async () => {
      controller = new AbortController();
      try {
        const detection = await api.currentPerson(controller.signal);
        const prev = latest.current;
        if (!stopped && !(prev.failures === 0 && !prev.unauthorized && sameDetection(prev.detection, detection)))
          publish({ detection, failures: 0, unauthorized: false });
      } catch (err) {
        if (stopped || (err as Error).name === "AbortError") return;
        const unauthorized = err instanceof ApiError && err.isUnauthorized;
        // Ride out a single blip, but once polls keep failing drop the last
        // detection: an identity we can no longer confirm must not stay up.
        const failures = latest.current.failures + 1;
        publish({
          detection: failures >= FAILURES_BEFORE_UNAVAILABLE || unauthorized ? null : latest.current.detection,
          failures,
          unauthorized,
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
