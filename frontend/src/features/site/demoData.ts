/**
 * Fictional data for the public homepage's SIMULATED demo. Nothing here is
 * connected to the real recognition engine or database, and nothing here is
 * ever shown in the patient app.
 *
 * The similarity scores are illustrative values on the same cosine scale the
 * real engine uses (config.SCORE_HIGH = 0.40, config.SCORE_MEDIUM = 0.32).
 */
export type DemoScenario = "known" | "uncertain" | "unknown" | "empty";

export const SCORE_HIGH = 0.4;
export const SCORE_MEDIUM = 0.32;

export const DEMO_VISITOR = {
  name: "Daniel Hughes",
  relationship: "Your grandson",
  lastVisit: "last Sunday",
  memory: "You listened to the piano piece he's learning, and he told you about his new flat in Bristol.",
};

export interface ScenarioInfo {
  label: string;
  /** Simulated best-match similarity (null when no face is in view). */
  score: number | null;
  title: string;
  explain: string;
}

export const SCENARIOS: Record<DemoScenario, ScenarioInfo> = {
  known: {
    label: "Familiar visitor",
    score: 0.72,
    title: "Confident match",
    explain:
      "The face embedding is well above the 0.40 confidence threshold, so the screen shows who it is, how they're related, and what you last talked about.",
  },
  uncertain: {
    label: "Possible match",
    score: 0.35,
    title: "Not sure — so it says so",
    explain:
      "Between 0.32 and 0.40 the system is unsure. It phrases the name as a question and hides the photo, memories and read-aloud, so a guess never looks like a fact.",
  },
  unknown: {
    label: "Someone new",
    score: 0.18,
    title: "Open-set rejection",
    explain:
      "The closest enrolled face scores far below the threshold. Instead of picking the nearest name, the screen says it doesn't recognise this person.",
  },
  empty: {
    label: "No one there",
    score: null,
    title: "Waiting calmly",
    explain:
      "With no face in view, any previous visitor's details are cleared — nothing lingers from the last person who sat down.",
  },
};

export const SCENARIO_ORDER: DemoScenario[] = ["known", "uncertain", "unknown", "empty"];
