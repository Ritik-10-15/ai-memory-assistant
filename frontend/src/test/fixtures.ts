import type { AppStatus, CurrentPerson } from "@/api/types";

export const idle: CurrentPerson = {
  person_id: null,
  name: null,
  confidence: 0,
  state: "idle",
  emotion: null,
  relationship: null,
  notes: null,
  last_memory: null,
  recent_memories: [],
  last_visit_at: null,
  display_message: null,
  certainty_label: null,
  certainty_class: null,
};

export const sarah: CurrentPerson = {
  ...idle,
  person_id: "11111111-1111-4111-8111-111111111111",
  name: "sarah johnson",
  confidence: 0.72,
  state: "high",
  relationship: "Daughter",
  notes: "Visits every Sunday. Loves gardening.",
  last_memory: "You talked about the roses in the back garden.",
  recent_memories: [
    { summary: "You talked about the roses in the back garden.", when: "2026-10-20 15:00:00" },
    { summary: "She brought photos from the beach trip.", when: "2026-10-13 15:00:00" },
  ],
  last_visit_at: "2026-10-20 14:30:00",
  display_message: "This is Sarah Johnson",
  certainty_label: "Recognized",
  certainty_class: "high",
};

export const john: CurrentPerson = {
  ...idle,
  person_id: "22222222-2222-4222-8222-222222222222",
  name: "john smith",
  confidence: 0.68,
  state: "high",
  relationship: "Neighbour",
  notes: null,
  last_memory: "You discussed the football match.",
  recent_memories: [{ summary: "You discussed the football match.", when: "2026-10-25 10:00:00" }],
  display_message: "This is John Smith",
  certainty_label: "Recognized",
  certainty_class: "high",
};

/** The backend's "medium" band: it still sends memories — the UI must not show them. */
export const maybeSarah: CurrentPerson = {
  ...sarah,
  state: "medium",
  confidence: 0.35,
  display_message: "This might be Sarah Johnson",
  certainty_label: "Not sure",
  certainty_class: "medium",
};

export const unknownFace: CurrentPerson = {
  ...idle,
  state: "unknown",
  confidence: 0.1,
  display_message: "I don't recognize this person",
  certainty_label: "Unknown",
  certainty_class: "unknown",
};

export const serverStatus: AppStatus = {
  camera_mode: "server",
  models_loaded: true,
  voice_memos: false,
  llm_summaries: false,
  enrolled_people: 2,
  gallery_embeddings: 14,
};

/** Phase 5 photo fields, empty — spread into hand-written FamilyPhoto fixtures. */
export const photoExtras = { location: "", category: "" as const, prompt: "", width: 1600, height: 1200, memory: null };
