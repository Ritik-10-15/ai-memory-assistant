import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Keep spoken recall short and calm: a long transcript is cut at a sentence
 * boundary. The full text always stays visible on screen.
 */
export function trimForSpeech(text: string, maxChars = 400): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (lastStop > 80 ? cut.slice(0, lastStop + 1) : cut) + " …";
}

export interface Speech {
  supported: boolean;
  speaking: boolean;
  /** Which item is being read (e.g. "visitor", "memory:12"), or null. */
  speakingId: string | null;
  speak: (text: string, id?: string) => void;
  stop: () => void;
}

/**
 * Patient-controlled read-aloud via the browser's speechSynthesis (no
 * server round-trip, can be stopped mid-sentence). One voice at a time:
 * starting a new item stops the previous one. Speech is cancelled on
 * unmount so it never keeps talking to an empty room.
 */
export function useSpeech(rate = 0.95): Speech {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const current = useRef<SpeechSynthesisUtterance | null>(null);

  const stop = useCallback(() => {
    current.current = null;
    if (supported) window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, [supported]);

  const speak = useCallback(
    (text: string, id = "default") => {
      if (!supported || !text) return;
      window.speechSynthesis.cancel(); // pressing twice must not stack speech
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = rate;
      const finish = () => {
        if (current.current === utter) {
          current.current = null;
          setSpeakingId(null);
        }
      };
      utter.onend = finish;
      utter.onerror = finish;
      current.current = utter;
      setSpeakingId(id);
      window.speechSynthesis.speak(utter);
    },
    [supported, rate],
  );

  useEffect(
    () => () => {
      if (supported) window.speechSynthesis.cancel();
    },
    [supported],
  );

  return { supported, speaking: speakingId !== null, speakingId, speak, stop };
}
