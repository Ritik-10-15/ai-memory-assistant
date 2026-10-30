import { useCallback, useEffect, useState } from "react";

/**
 * Display preferences for the caregiver workspace on THIS device.
 * Only harmless UI choices are stored (never patient data), and storage
 * failures (private mode, blocked storage) simply fall back to defaults.
 */
export interface CaregiverPrefs {
  largerText: boolean;
  reduceMotion: boolean;
}

export const DEFAULT_PREFS: CaregiverPrefs = { largerText: false, reduceMotion: false };
const KEY = "memory-assistant:caregiver-prefs";
const EVENT = "memory-assistant:prefs-changed";

export function readPrefs(): CaregiverPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<CaregiverPrefs>) : {};
    return {
      largerText: parsed.largerText === true,
      reduceMotion: parsed.reduceMotion === true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function usePreferences(): [CaregiverPrefs, (patch: Partial<CaregiverPrefs>) => void] {
  const [prefs, setPrefs] = useState<CaregiverPrefs>(readPrefs);

  // Keep every component that uses preferences in step.
  useEffect(() => {
    const sync = () => setPrefs(readPrefs());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  const update = useCallback((patch: Partial<CaregiverPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable: the choice still applies for this visit */
      }
      queueMicrotask(() => window.dispatchEvent(new Event(EVENT)));
      return next;
    });
  }, []);

  return [prefs, update];
}

/** Apply preferences while the caregiver workspace is open; undo on leaving. */
export function useApplyPreferences(prefs: CaregiverPrefs) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.fontSize;
    root.style.fontSize = prefs.largerText ? "112.5%" : "";
    root.classList.toggle("reduce-motion", prefs.reduceMotion);
    return () => {
      root.style.fontSize = previous;
      root.classList.remove("reduce-motion");
    };
  }, [prefs.largerText, prefs.reduceMotion]);
}
