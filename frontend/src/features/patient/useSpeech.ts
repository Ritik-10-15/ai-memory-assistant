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

/**
 * Patient-controlled read-aloud via the browser's speechSynthesis (no
 * server round-trip, can be stopped mid-sentence). Speech is cancelled on
 * unmount so it never keeps talking to an empty room.
 */
export function useSpeech(rate = 0.95) {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [speaking, setSpeaking] = useState(false);
  const current = useRef<SpeechSynthesisUtterance | null>(null);

  const stop = useCallback(() => {
    current.current = null;
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported || !text) return;
      window.speechSynthesis.cancel(); // pressing twice must not stack speech
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = rate;
      const finish = () => {
        if (current.current === utter) {
          current.current = null;
          setSpeaking(false);
        }
      };
      utter.onend = finish;
      utter.onerror = finish;
      current.current = utter;
      setSpeaking(true);
      window.speechSynthesis.speak(utter);
    },
    [supported, rate],
  );

  useEffect(() => () => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  return { supported, speaking, speak, stop };
}
