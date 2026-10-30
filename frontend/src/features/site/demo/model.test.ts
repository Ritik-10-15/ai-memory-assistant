import { deriveView, demoReducer, INITIAL_STATE, isFirst, isLast, PEOPLE, SCENARIOS, SCORE_HIGH, SCORE_MEDIUM, type DemoState } from "./model";

const allFrames = SCENARIOS.flatMap((s) => s.frames.map((f, i) => ({ s, f, i })));

describe("demo scenarios", () => {
  it("covers the five required situations, A to E", () => {
    expect(SCENARIOS.map((s) => `${s.letter}:${s.title}`)).toEqual([
      "A:Known visitor",
      "B:Unknown visitor",
      "C:No face detected",
      "D:Different visitor",
      "E:Uncertain recognition",
    ]);
  });

  it("walks Recognise → Identify → Retrieve memory → Reconnect for a known visitor", () => {
    expect(SCENARIOS[0].frames.map((f) => f.step)).toEqual(["Recognise", "Identify", "Retrieve memory", "Reconnect"]);
  });

  it("keeps simulated scores consistent with the real thresholds", () => {
    for (const { s, f } of allFrames) {
      if (f.score === null) continue;
      if (f.status === "known") expect(f.score, s.id).toBeGreaterThanOrEqual(SCORE_HIGH);
      if (f.status === "uncertain") expect(f.score, s.id).toBeGreaterThanOrEqual(SCORE_MEDIUM);
      if (f.status === "uncertain") expect(f.score, s.id).toBeLessThan(SCORE_HIGH);
      if (f.status === "unknown") expect(f.score, s.id).toBeLessThan(SCORE_MEDIUM);
    }
  });
});

describe("deriveView safety rules — checked on every frame of every scenario", () => {
  it.each(allFrames.map(({ s, f, i }) => [`${s.letter}${i + 1} ${f.step}`, f] as const))("%s", (_label, frame) => {
    const view = deriveView(frame);
    const confirmed = frame.status === "known" || frame.status === "holding";
    // A person is only ever shown for a confirmed identity …
    if (!confirmed) expect(view.person).toBeNull();
    // … memories only ever accompany that person …
    if (view.showRecall) expect(view.person).not.toBeNull();
    // … and a possible match is only a first name, never a profile.
    if (frame.status === "uncertain") {
      expect(view.person).toBeNull();
      expect(view.candidateFirstName).toBe("Daniel");
    } else {
      expect(view.candidateFirstName).toBeNull();
    }
  });

  it("shows nobody for an unknown face or an empty room", () => {
    const unknown = SCENARIOS[1].frames[3];
    const empty = SCENARIOS[2].frames[3];
    expect(deriveView(unknown)).toMatchObject({ status: "unknown", person: null, showRecall: false });
    expect(deriveView(empty)).toMatchObject({ status: "idle", person: null, showRecall: false });
  });

  it("replaces one visitor with another, never mixing them", () => {
    const [daniel, newFace, ruthIdentified, ruthMemory] = SCENARIOS[3].frames.map(deriveView);
    expect(daniel.person?.id).toBe("daniel");
    expect(newFace.person).toBeNull();
    expect(ruthIdentified.person?.id).toBe("ruth");
    expect(ruthIdentified.showRecall).toBe(false);
    expect(ruthMemory.person).toBe(PEOPLE.ruth);
    expect(ruthMemory.showRecall).toBe(true);
  });
});

describe("demo navigation", () => {
  const at = (scenario: number, frame: number): DemoState => ({ scenario, frame });

  it("steps forward and back within a scenario", () => {
    expect(demoReducer(at(0, 0), { type: "next" })).toEqual(at(0, 1));
    expect(demoReducer(at(0, 1), { type: "prev" })).toEqual(at(0, 0));
  });

  it("continues into the next scenario, and back again", () => {
    expect(demoReducer(at(0, 3), { type: "next" })).toEqual(at(1, 0));
    expect(demoReducer(at(1, 0), { type: "prev" })).toEqual(at(0, 3));
  });

  it("stops at both ends of the tour", () => {
    expect(demoReducer(INITIAL_STATE, { type: "prev" })).toEqual(INITIAL_STATE);
    const end = at(4, 3);
    expect(isLast(end)).toBe(true);
    expect(demoReducer(end, { type: "next" })).toEqual(end);
    expect(isFirst(INITIAL_STATE)).toBe(true);
  });

  it("selecting a scenario starts it from the first step; goto jumps within it", () => {
    expect(demoReducer(at(0, 2), { type: "select", scenario: 3 })).toEqual(at(3, 0));
    expect(demoReducer(at(3, 0), { type: "goto", frame: 2 })).toEqual(at(3, 2));
    expect(demoReducer(at(3, 0), { type: "goto", frame: 99 })).toEqual(at(3, 3));
  });

  it("restart returns to scenario A, step 1", () => {
    expect(demoReducer(at(4, 2), { type: "restart" })).toEqual(INITIAL_STATE);
  });
});
