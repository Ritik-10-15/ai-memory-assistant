import { idle, maybeSarah, sarah, unknownFace } from "@/test/fixtures";
import { announcementFor, derivePatientView, FAILURES_BEFORE_UNAVAILABLE, viewKey } from "./recognitionView";

const base = { failures: 0, cameraProblem: null };

describe("derivePatientView", () => {
  it("shows a confirmed identity only for the high band", () => {
    const view = derivePatientView({ ...base, detection: sarah });
    expect(view).toMatchObject({
      kind: "known",
      name: "Sarah Johnson",
      relationship: "Daughter",
      lastMemory: sarah.last_memory,
      lastMemoryAt: "2026-10-20 15:00:00",
      lastVisitAt: "2026-10-20 14:30:00",
    });
    expect(view.kind === "known" && view.earlierMemories).toHaveLength(1);
  });

  it("treats the medium band as uncertain and exposes no memories or details", () => {
    const view = derivePatientView({ ...base, detection: maybeSarah });
    expect(view).toEqual({ kind: "uncertain", personId: sarah.person_id, name: "Sarah Johnson" });
  });

  it("maps idle to no-face and unknown to unknown", () => {
    expect(derivePatientView({ ...base, detection: idle }).kind).toBe("no-face");
    expect(derivePatientView({ ...base, detection: unknownFace }).kind).toBe("unknown");
  });

  it("never invents an identity from an inconsistent response", () => {
    expect(derivePatientView({ ...base, detection: { ...sarah, name: null } }).kind).toBe("unknown");
    expect(derivePatientView({ ...base, detection: { ...sarah, person_id: null } }).kind).toBe("unknown");
    expect(derivePatientView({ ...base, detection: { ...maybeSarah, name: "" } }).kind).toBe("unknown");
  });

  it("reports the service as unavailable after repeated failures, hiding any identity", () => {
    expect(derivePatientView({ ...base, detection: sarah, failures: 1 }).kind).toBe("known");
    expect(
      derivePatientView({ ...base, detection: sarah, failures: FAILURES_BEFORE_UNAVAILABLE }).kind,
    ).toBe("service-unavailable");
  });

  it("puts camera problems first", () => {
    expect(derivePatientView({ detection: sarah, failures: 5, cameraProblem: "denied" })).toEqual({
      kind: "camera-unavailable",
      reason: "denied",
    });
  });

  it("is 'connecting' before the first response", () => {
    expect(derivePatientView({ ...base, detection: null }).kind).toBe("connecting");
  });
});

describe("announcements and keys", () => {
  it("phrases the announcement for each state", () => {
    expect(announcementFor(derivePatientView({ ...base, detection: sarah }))).toBe(
      "This is Sarah Johnson, your daughter.",
    );
    expect(announcementFor(derivePatientView({ ...base, detection: maybeSarah }))).toMatch(/might be Sarah/);
  });

  it("changes key when the visitor changes, not on every poll", () => {
    const a = viewKey(derivePatientView({ ...base, detection: sarah }));
    const b = viewKey(derivePatientView({ ...base, detection: { ...sarah, confidence: 0.9 } }));
    const c = viewKey(derivePatientView({ ...base, detection: { ...sarah, person_id: "other" } }));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
