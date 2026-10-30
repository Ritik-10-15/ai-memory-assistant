import { act, render } from "@testing-library/react";
import { api } from "@/api/client";
import type { CurrentPerson } from "@/api/types";
import { idle, sarah } from "@/test/fixtures";
import { createFrameStore, useFrame, type FrameStore } from "./useBrowserCamera";
import { POLL_INTERVAL_MS, sameDetection, useRecognition } from "./useRecognition";

/**
 * Phase 8: the patient screen used to re-render in full for every camera
 * frame (about six a second) and for every recognition poll, even when
 * nothing on screen changed.
 */

describe("camera frames reach only the overlay", () => {
  it("a new face box re-renders the overlay, not the screen around it", () => {
    const store = createFrameStore();
    const renders = { screen: 0, overlay: 0 };
    function Overlay({ frames }: { frames: FrameStore }) {
      renders.overlay++;
      const frame = useFrame(frames);
      return <p>{frame?.box ? "face" : "none"}</p>;
    }
    function Screen() {
      renders.screen++;
      return (
        <main>
          <h1>Patient screen</h1>
          <Overlay frames={store} />
        </main>
      );
    }
    const { getByText } = render(<Screen />);
    for (let i = 0; i < 10; i++) {
      act(() => store.set({ box: [i, 0, 10, 10], width: 640, height: 480 }));
    }
    expect(getByText("face")).toBeInTheDocument();
    expect(renders).toEqual({ screen: 1, overlay: 11 });
  });
});

describe("unchanged recognition polls do not re-render the screen", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("only a change the screen shows causes a render", async () => {
    const responses: CurrentPerson[] = [
      sarah,
      { ...sarah, confidence: 0.71 },
      { ...sarah, confidence: 0.69 },
      { ...sarah, confidence: 0.74 },
      idle,
      idle,
    ];
    let i = 0;
    vi.spyOn(api, "currentPerson").mockImplementation(async () => responses[Math.min(i++, responses.length - 1)]);
    let renders = 0;
    const seen: string[] = [];
    function Probe() {
      const feed = useRecognition(true);
      renders++;
      seen.push(feed.detection?.state ?? "none");
      return null;
    }
    render(<Probe />);
    for (let k = 0; k < responses.length; k++) {
      await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS + 10));
    }
    expect(i).toBeGreaterThanOrEqual(responses.length);
    // first render, Sarah arrives, then nobody: three renders for six polls.
    expect(renders).toBe(3);
    expect(seen).toEqual(["none", "high", "idle"]);
  });

  it("treats a different person or any visible detail as a change", () => {
    expect(sameDetection(sarah, { ...sarah, confidence: 0.1 })).toBe(true);
    expect(sameDetection(sarah, { ...sarah, last_memory: "Something new" })).toBe(false);
    expect(sameDetection(sarah, { ...sarah, state: "medium" })).toBe(false);
    expect(sameDetection(sarah, { ...sarah, person_id: "someone-else" })).toBe(false);
    expect(sameDetection(null, sarah)).toBe(false);
  });
});
