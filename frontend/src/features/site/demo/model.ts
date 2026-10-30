/**
 * Interactive demo — data model, scenarios and state machine.
 *
 * Everything here is FICTIONAL and lives only in the browser. Nothing is
 * read from (or sent to) the Flask backend, the camera or the database.
 *
 * Each scenario is a short sequence of frames: what the simulated camera
 * sees and what the simulated recogniser concludes. The screen is DERIVED
 * from the current frame alone (see deriveView), exactly like the real
 * patient app derives its view from the latest /api/current-person reply —
 * so a previous visitor's details can never linger on the next frame.
 */

// Same cosine-similarity bands as the real engine (config.py).
export const SCORE_HIGH = 0.4;
export const SCORE_MEDIUM = 0.32;

// ── Fictional people ─────────────────────────────────────────────────
export type PersonId = "daniel" | "ruth";
export type Figure = PersonId | "stranger";
export type MemoryScene = "garden" | "kitchen";

export interface DemoMemory {
  title: string;
  story: string;
  when: string;
  scene: MemoryScene;
}

export interface DemoPerson {
  id: PersonId;
  name: string;
  relationship: string;
  lastVisit: string;
  /** What you talked about last time. */
  conversation: string;
  /** A family memory associated with them. */
  memory: DemoMemory;
}

export const PEOPLE: Record<PersonId, DemoPerson> = {
  daniel: {
    id: "daniel",
    name: "Daniel Hughes",
    relationship: "Your grandson",
    lastVisit: "last Sunday",
    conversation: "You listened to the piano piece he's learning, and he told you about his new flat in Bristol.",
    memory: {
      title: "Strawberry picking",
      story: "Every June you took Daniel to the farm on Mill Lane. He always ate more strawberries than he picked.",
      when: "Summer 2009",
      scene: "garden",
    },
  },
  ruth: {
    id: "ruth",
    name: "Ruth Hughes",
    relationship: "Your daughter",
    lastVisit: "on Thursday",
    conversation: "Ruth brought the photo album from Cornwall, and you planned the birthday lunch together.",
    memory: {
      title: "Sunday baking",
      story: "You taught Ruth your lemon drizzle recipe when she was ten. She still makes it for every family birthday.",
      when: "Spring 1984",
      scene: "kitchen",
    },
  },
};

// ── Frames and scenarios ─────────────────────────────────────────────
/** What the simulated recogniser concludes on a frame. */
export type RecognitionStatus =
  | "idle" // no face in view
  | "detecting" // a face is in view, not yet identified
  | "known" // confident match
  | "holding" // face briefly lost; last confident identity kept for a moment
  | "uncertain" // possible match — never shown as confirmed
  | "unknown"; // face in view, nobody enrolled matches

export interface DemoFrame {
  /** Short step label for the progress indicator. */
  step: string;
  /** Who is physically in front of the (illustrated) camera. */
  inView: Figure | null;
  /** Draw them stepping out of frame. */
  leaving?: boolean;
  status: RecognitionStatus;
  /** Identity the recogniser asserts — only meaningful for known/holding. */
  matchId?: PersonId;
  /** Possible match — only its first name is ever shown, as a question. */
  candidateId?: PersonId;
  /** Simulated best-match similarity, or null when no face is analysed. */
  score: number | null;
  /** Whether this frame has reached the memory-retrieval stage. */
  recall: boolean;
  /** Plain-language explanation of what's happening. */
  explain: string;
}

export type ScenarioId = "known" | "unknown" | "empty" | "switch" | "uncertain";

export interface DemoScenario {
  id: ScenarioId;
  letter: "A" | "B" | "C" | "D" | "E";
  title: string;
  summary: string;
  frames: DemoFrame[];
}

export const SCENARIOS: DemoScenario[] = [
  {
    id: "known",
    letter: "A",
    title: "Known visitor",
    summary: "A familiar face, recognised confidently.",
    frames: [
      {
        step: "Recognise",
        inView: "daniel",
        status: "detecting",
        score: null,
        recall: false,
        explain: "Someone sits down. The face detector finds a face and lines it up for comparison — no name yet.",
      },
      {
        step: "Identify",
        inView: "daniel",
        status: "known",
        matchId: "daniel",
        score: 0.72,
        recall: false,
        explain: "The face's identity signature scores 0.72 against Daniel's enrolled photos — well above the 0.40 confidence line.",
      },
      {
        step: "Retrieve memory",
        inView: "daniel",
        status: "known",
        matchId: "daniel",
        score: 0.72,
        recall: true,
        explain: "With the identity confirmed, Daniel's relationship, last visit and last conversation are looked up.",
      },
      {
        step: "Reconnect",
        inView: "daniel",
        status: "known",
        matchId: "daniel",
        score: 0.72,
        recall: true,
        explain: "The patient can read or listen to what they last talked about, and enjoy a family memory together.",
      },
    ],
  },
  {
    id: "unknown",
    letter: "B",
    title: "Unknown visitor",
    summary: "Someone the system has never been shown.",
    frames: [
      {
        step: "Recognise",
        inView: "stranger",
        status: "detecting",
        score: null,
        recall: false,
        explain: "A face is detected. So far, this looks exactly like a normal visit.",
      },
      {
        step: "Identify",
        inView: "stranger",
        status: "unknown",
        score: 0.18,
        recall: false,
        explain: "The closest enrolled face only scores 0.18. Rather than pick the nearest name, the system declares an unknown visitor.",
      },
      {
        step: "Retrieve memory",
        inView: "stranger",
        status: "unknown",
        score: 0.18,
        recall: true,
        explain: "There is no one to look up, so no memories are retrieved — nothing private is shown to a stranger.",
      },
      {
        step: "Reconnect",
        inView: "stranger",
        status: "unknown",
        score: 0.18,
        recall: true,
        explain: "The screen reassures instead: it's fine to ask who they are. A caregiver can enroll them later.",
      },
    ],
  },
  {
    id: "empty",
    letter: "C",
    title: "No face detected",
    summary: "The visitor gets up and leaves.",
    frames: [
      {
        step: "Recognised",
        inView: "daniel",
        status: "known",
        matchId: "daniel",
        score: 0.72,
        recall: true,
        explain: "Daniel is recognised and his last conversation is on screen.",
      },
      {
        step: "Looks away",
        inView: "daniel",
        leaving: true,
        status: "holding",
        matchId: "daniel",
        score: null,
        recall: true,
        explain: "Daniel turns to leave and his face is lost. The last confident identity is held for about a second, so a blink or glance away doesn't make the screen flicker.",
      },
      {
        step: "Clears",
        inView: null,
        status: "idle",
        score: null,
        recall: false,
        explain: "No face for a few seconds: the identity is cleared, along with his relationship, conversation and memory.",
      },
      {
        step: "Waiting",
        inView: null,
        status: "idle",
        score: null,
        recall: false,
        explain: "The screen rests calmly until the next visitor sits down. Nothing from Daniel's visit lingers.",
      },
    ],
  },
  {
    id: "switch",
    letter: "D",
    title: "Different visitor",
    summary: "Daniel leaves and his mother Ruth sits down.",
    frames: [
      {
        step: "Daniel",
        inView: "daniel",
        status: "known",
        matchId: "daniel",
        score: 0.72,
        recall: true,
        explain: "Daniel is recognised, with his conversation and memory on screen.",
      },
      {
        step: "New face",
        inView: "ruth",
        status: "detecting",
        score: null,
        recall: false,
        explain: "A different face appears. Within a fraction of a second Daniel's details are removed — they are never shown beside someone else's face.",
      },
      {
        step: "Identify",
        inView: "ruth",
        status: "known",
        matchId: "ruth",
        score: 0.68,
        recall: false,
        explain: "The new face scores 0.68 against Ruth's enrolled photos — a confident match for a different person.",
      },
      {
        step: "Ruth's memory",
        inView: "ruth",
        status: "known",
        matchId: "ruth",
        score: 0.68,
        recall: true,
        explain: "Ruth's relationship, conversation and memory replace Daniel's entirely.",
      },
    ],
  },
  {
    id: "uncertain",
    letter: "E",
    title: "Uncertain recognition",
    summary: "Poor light and a turned head.",
    frames: [
      {
        step: "Recognise",
        inView: "daniel",
        status: "detecting",
        score: null,
        recall: false,
        explain: "A face is detected, but it's turned away and in shadow.",
      },
      {
        step: "Unsure",
        inView: "daniel",
        status: "uncertain",
        candidateId: "daniel",
        score: 0.35,
        recall: false,
        explain: "It scores 0.35 — inside the 0.32–0.40 'possible match' band. The name is phrased as a question, never as a fact.",
      },
      {
        step: "Memories withheld",
        inView: "daniel",
        status: "uncertain",
        candidateId: "daniel",
        score: 0.35,
        recall: true,
        explain: "Personal details stay hidden while the system is unsure: no photo, relationship, conversation or memory.",
      },
      {
        step: "Confirmed",
        inView: "daniel",
        status: "known",
        matchId: "daniel",
        score: 0.71,
        recall: true,
        explain: "Daniel turns towards the camera. The score rises to 0.71, the identity is confirmed, and only now do his memories appear.",
      },
    ],
  },
];

// ── What the screen shows (derived, never carried over) ──────────────
export interface DemoView {
  status: RecognitionStatus;
  /** The confirmed person, or null. Only for known/holding frames. */
  person: DemoPerson | null;
  /** First name of a possible match — uncertain frames only. */
  candidateFirstName: string | null;
  /** Whether the conversation and memory are on screen. */
  showRecall: boolean;
}

export function deriveView(frame: DemoFrame): DemoView {
  const confirmed = (frame.status === "known" || frame.status === "holding") && frame.matchId ? PEOPLE[frame.matchId] : null;
  return {
    status: frame.status,
    person: confirmed,
    candidateFirstName:
      frame.status === "uncertain" && frame.candidateId ? PEOPLE[frame.candidateId].name.split(" ")[0] : null,
    // Memories only ever accompany a confirmed identity.
    showRecall: Boolean(confirmed && frame.recall),
  };
}

// ── Navigation state machine ─────────────────────────────────────────
export interface DemoState {
  scenario: number; // index into SCENARIOS
  frame: number; // index into that scenario's frames
}

export type DemoAction =
  | { type: "select"; scenario: number }
  | { type: "next" }
  | { type: "prev" }
  | { type: "goto"; frame: number }
  | { type: "restart" };

export const INITIAL_STATE: DemoState = { scenario: 0, frame: 0 };

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  const frames = SCENARIOS[state.scenario].frames.length;
  switch (action.type) {
    case "select":
      return { scenario: clamp(action.scenario, 0, SCENARIOS.length - 1), frame: 0 };
    case "goto":
      return { ...state, frame: clamp(action.frame, 0, frames - 1) };
    case "next":
      if (state.frame < frames - 1) return { ...state, frame: state.frame + 1 };
      if (state.scenario < SCENARIOS.length - 1) return { scenario: state.scenario + 1, frame: 0 };
      return state; // end of the tour
    case "prev":
      if (state.frame > 0) return { ...state, frame: state.frame - 1 };
      if (state.scenario > 0) {
        const prev = state.scenario - 1;
        return { scenario: prev, frame: SCENARIOS[prev].frames.length - 1 };
      }
      return state;
    case "restart":
      return INITIAL_STATE;
  }
}

export function isFirst(s: DemoState) {
  return s.scenario === 0 && s.frame === 0;
}

export function isLast(s: DemoState) {
  return s.scenario === SCENARIOS.length - 1 && s.frame === SCENARIOS[s.scenario].frames.length - 1;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
