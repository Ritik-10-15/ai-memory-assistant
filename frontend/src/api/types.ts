/**
 * Response shapes of the Flask backend. Patient endpoints live in
 * routes.py; caregiver/session endpoints in api.py. Keep in sync.
 */

/** Recognition bands from worker.py: high ≥ SCORE_HIGH, medium ≥ SCORE_MEDIUM. */
export type RecognitionState = "idle" | "high" | "medium" | "unknown";

export interface MemorySnippet {
  summary: string;
  when: string;
}

/** GET /api/current-person */
export interface CurrentPerson {
  person_id: string | null;
  name: string | null;
  confidence: number;
  state: RecognitionState;
  emotion: string | null;
  relationship: string | null;
  notes: string | null;
  last_memory: string | null;
  recent_memories: MemorySnippet[];
  last_visit_at?: string | null;
  display_message: string | null;
  certainty_label: string | null;
  certainty_class: string | null;
}

/** POST /api/frame — [x, y, w, h] in source-frame pixels. */
export interface FrameResult {
  box: [number, number, number, number] | null;
  width: number;
  height: number;
}

/** GET /api/status */
export interface AppStatus {
  camera_mode: "server" | "browser";
  models_loaded: boolean;
  voice_memos: boolean;
  llm_summaries: boolean;
  enrolled_people: number;
  gallery_embeddings: number;
}

/** GET /api/session */
export interface SessionInfo {
  caregiver: boolean;
  patient: boolean;
  patient_pin_required: boolean;
}

/** GET /api/stats */
export interface Stats {
  total_people: number;
  total_visits: number;
  total_memories: number;
  today_visits: number;
}

export interface Person {
  id: string;
  name: string;
  relationship: string;
  notes: string;
  dob: string;
  tts_greeting: string;
  created_at: string;
  memory_count: number;
  visit_count: number;
  last_visit_at: string | null;
  photo_count: number;
  /** Usable face embeddings in the live gallery — the real "enrolled" signal. */
  embedding_count: number;
}

export interface Memory {
  id: number;
  person_id: string;
  person_name: string;
  summary: string;
  raw_transcript: string | null;
  source: string;
  created_at: string;
}

export interface Visit {
  id: number;
  person_id: string;
  person_name: string;
  relationship: string;
  started_at: string;
  ended_at: string | null;
  duration_s: number;
  confidence: number | null;
}

export interface PersonDetail {
  person: Person;
  memories: Memory[];
  visits: Visit[];
}

export type PhotoStatus = "accepted" | "no_face" | "multiple_faces" | "invalid_image";

export interface PhotoResult {
  filename: string;
  status: PhotoStatus;
}

export interface SavePersonResult {
  person: Person;
  photos: PhotoResult[];
}

export interface Analytics {
  per_person: Array<{
    person_id: string;
    name: string;
    visits: number;
    avg_duration_s: number;
    last_seen: string | null;
  }>;
  daily: Array<{ day: string; visits: number }>;
  memory_sources: Array<{ source: string; count: number }>;
}

export type EnrollReason =
  | "no_face"
  | "multiple_faces"
  | "invalid_image"
  | "camera_unavailable"
  | "unknown_person";

/** POST /caregiver/enroll/<pid>/capture */
export interface EnrollCaptureResult {
  success: boolean;
  count: number;
  reason?: EnrollReason;
}

export interface PersonInput {
  name: string;
  relationship: string;
  notes: string;
  dob: string;
  tts_greeting: string;
}
