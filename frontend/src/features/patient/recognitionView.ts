import type { CurrentPerson, MemorySnippet } from "@/api/types";
import { titleCase } from "@/lib/format";

/**
 * What the patient screen shows, derived ONLY from the latest backend
 * response plus connection/camera health. Nothing from an earlier response
 * is carried over, so a previous visitor's name can never linger when the
 * backend reports someone unknown, someone different, or nobody.
 *
 * Safety rules (mirroring the backend's confidence bands in worker.py):
 *  - "known" only for state "high" with a person id and name.
 *  - "uncertain" (state "medium") shows the name as a question and never
 *    the photo, memories or read-aloud — a guess must not look confirmed.
 *  - Anything inconsistent (e.g. "high" without a name) falls back to
 *    "unknown" rather than guessing.
 */
export type PatientView =
  | { kind: "connecting" }
  | { kind: "service-unavailable" }
  | { kind: "camera-unavailable"; reason: CameraProblem }
  | { kind: "no-face" }
  | { kind: "unknown" }
  | { kind: "uncertain"; personId: string; name: string }
  | {
      kind: "known";
      personId: string;
      name: string;
      relationship: string | null;
      notes: string | null;
      lastMemory: string | null;
      lastMemoryAt: string | null;
      earlierMemories: MemorySnippet[];
      lastVisitAt: string | null;
    };

export type CameraProblem = "denied" | "unavailable" | "unsupported" | "insecure";

export interface ViewInputs {
  detection: CurrentPerson | null;
  /** Consecutive failed /api/current-person polls. */
  failures: number;
  cameraProblem: CameraProblem | null;
}

/** Polls (~0.7 s apart) that may fail before the screen admits a problem. */
export const FAILURES_BEFORE_UNAVAILABLE = 2;

export function derivePatientView({ detection, failures, cameraProblem }: ViewInputs): PatientView {
  if (cameraProblem) return { kind: "camera-unavailable", reason: cameraProblem };
  if (failures >= FAILURES_BEFORE_UNAVAILABLE) return { kind: "service-unavailable" };
  if (!detection) return { kind: "connecting" };

  const { state, person_id: personId, name } = detection;

  if (state === "idle") return { kind: "no-face" };

  if (state === "high" && personId && name) {
    const memories = Array.isArray(detection.recent_memories) ? detection.recent_memories : [];
    return {
      kind: "known",
      personId,
      name: titleCase(name),
      relationship: detection.relationship || null,
      notes: detection.notes || null,
      lastMemory: detection.last_memory || null,
      lastMemoryAt: memories[0]?.when ?? null,
      earlierMemories: memories.slice(1, 3),
      lastVisitAt: detection.last_visit_at ?? null,
    };
  }

  if (state === "medium" && personId && name) {
    return { kind: "uncertain", personId, name: titleCase(name) };
  }

  return { kind: "unknown" };
}

/** Sentence for the screen-reader live region (announced on change only). */
export function announcementFor(view: PatientView): string {
  switch (view.kind) {
    case "known":
      return view.relationship ? `This is ${view.name}, your ${view.relationship.toLowerCase()}.` : `This is ${view.name}.`;
    case "uncertain":
      return `This might be ${view.name}, but I'm not sure.`;
    case "unknown":
      return "I don't recognise this person.";
    case "no-face":
      return "No one is in front of the camera.";
    case "camera-unavailable":
      return "The camera isn't available.";
    case "service-unavailable":
      return "The memory assistant is having trouble connecting.";
    default:
      return "";
  }
}

/** Stable key: changes exactly when the announced situation changes. */
export function viewKey(view: PatientView): string {
  return "personId" in view ? `${view.kind}:${view.personId}` : view.kind;
}
