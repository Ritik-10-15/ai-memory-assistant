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
  /** A public "try it yourself" deployment: visitors have their own accounts. */
  sandbox?: boolean;
  caregiver: boolean;
  patient: boolean;
  patient_pin_required: boolean;
}

/** GET /api/account (sandbox mode). Times are Unix seconds. */
export interface AccountInfo {
  username: string;
  created_at: number;
  expires_at: number;
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
  /** Chosen family photo shown as their picture (null → first enrollment photo). */
  profile_photo_id: string | null;
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

// ── Family album (album_api.py) ─────────────────────────────────────

export interface PhotoPerson {
  id: string;
  name: string;
  relationship: string;
}

export const PHOTO_CATEGORIES = ["family", "celebration", "holiday", "home", "friends", "everyday"] as const;
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];

/** The conversation memory a photo illustrates (summary only, never the transcript). */
export interface PhotoMemory {
  id: number;
  summary: string;
  person_name: string;
  created_at: string;
}

/** A family photo (not a biometric enrollment photo). */
export interface FamilyPhoto {
  id: string;
  caption: string;
  story: string;
  /** Free-form approximate date, e.g. "1998", "1998-07", "Summer 1998". */
  taken_on: string;
  /** Typed by the caregiver (GPS data is stripped from uploads). */
  location: string;
  category: PhotoCategory | "";
  /** Caregiver-written invitation to talk, e.g. "Would you like to hear about the pier?" */
  prompt: string;
  width: number | null;
  height: number | null;
  memory_id: number | null;
  memory: PhotoMemory | null;
  created_at: string;
  people: PhotoPerson[];
  /** Caregiver views only. */
  albums?: Array<{ id: string; title: string }>;
}

// ── Photo albums (albums_api.py) ────────────────────────────────────

/** What the patient sees of an album (GET /api/albums). */
export interface AlbumSummary {
  id: string;
  title: string;
  description: string;
  /** The chosen cover, else the first photo; null when the album is empty. */
  cover_photo_id: string | null;
  photo_count: number;
  updated_at: string;
}

/** GET /api/albums/<id> — one page of an album's photos, in album order. */
export interface AlbumPage {
  album: AlbumSummary;
  photos: FamilyPhoto[];
  total: number;
  limit: number;
  offset: number;
}

export interface CaregiverAlbum extends AlbumSummary {
  cover_chosen: boolean;
  visible_to_patient: boolean;
  created_at: string;
}

/** GET /api/caregiver/albums/<id> */
export interface AlbumDetail {
  album: CaregiverAlbum;
  photos: FamilyPhoto[];
}

export interface AlbumInput {
  title: string;
  description: string;
  visible_to_patient: boolean;
}

export type UploadRejection = "unsupported_type" | "too_large" | "invalid_image";

/** GET /api/family — what the patient sees about each person. */
export interface FamilyMember {
  id: string;
  name: string;
  relationship: string;
  description: string;
  last_visit_at: string | null;
  photo_count: number;
  recent_memory: { summary: string; created_at: string } | null;
}

/** A memory as shown to the patient: summary only, never the transcript. */
export interface AlbumMemory {
  id: number;
  person_id: string;
  person_name: string;
  relationship: string;
  summary: string;
  created_at: string;
  photo_id: string | null;
}

/** GET /api/family/<id> */
export interface FamilyMemberDetail {
  person: FamilyMember;
  memories: AlbumMemory[];
  photos: FamilyPhoto[];
  visits: { count: number; recent: string[] };
}

/** GET /api/album */
export interface Album {
  memories: AlbumMemory[];
  photos: FamilyPhoto[];
}

export interface PhotoDetailsInput {
  caption: string;
  story: string;
  taken_on: string;
  location: string;
  category: PhotoCategory | "";
  prompt: string;
  memory_id: number | null;
  person_ids: string[];
}

export interface UploadPhotosResult {
  photos: FamilyPhoto[];
  rejected: Array<{ filename: string; status: UploadRejection }>;
}
