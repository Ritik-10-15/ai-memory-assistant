/**
 * Fictional data for the homepage hero preview. Daniel is defined once, in
 * the interactive demo's model, so the hero and the demo always agree.
 * Nothing here is connected to the real recognition engine or database.
 */
import { PEOPLE } from "./demo/model";

/** States the static hero preview can render. */
export type DemoScenario = "known" | "uncertain" | "unknown" | "empty";

const daniel = PEOPLE.daniel;

export const DEMO_VISITOR = {
  name: daniel.name,
  relationship: daniel.relationship,
  lastVisit: daniel.lastVisit,
  memory: daniel.conversation,
};
