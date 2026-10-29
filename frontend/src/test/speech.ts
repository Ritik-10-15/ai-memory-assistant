import { vi } from "vitest";

/** Install a controllable fake of the Web Speech API. */
export function installSpeechMock() {
  const spoken: SpeechSynthesisUtterance[] = [];
  const synth = {
    speak: vi.fn((u: SpeechSynthesisUtterance) => {
      spoken.push(u);
    }),
    cancel: vi.fn(),
  };
  class FakeUtterance {
    text: string;
    rate = 1;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  return {
    synth,
    spoken,
    /** Simulate the browser finishing the current utterance. */
    finish: () => spoken.at(-1)?.onend?.(new Event("end") as SpeechSynthesisEvent),
  };
}
