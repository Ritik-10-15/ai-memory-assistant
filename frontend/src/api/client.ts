import type {
  Album,
  Analytics,
  AppStatus,
  CurrentPerson,
  EnrollCaptureResult,
  FamilyMember,
  FamilyMemberDetail,
  FamilyPhoto,
  FrameResult,
  Memory,
  Person,
  PersonDetail,
  PersonInput,
  PhotoDetailsInput,
  SavePersonResult,
  SessionInfo,
  Stats,
  UploadPhotosResult,
  Visit,
} from "./types";

/** Error carrying the HTTP status, so callers can tell auth from outages. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  /** Network failure (status 0) or a server-side problem. */
  get isUnavailable() {
    return this.status === 0 || this.status >= 500;
  }
}

/** Broadcast when any request comes back 401, so the app can re-route to sign-in. */
export const UNAUTHORIZED_EVENT = "memory-assistant:unauthorized";

type Body = Record<string, unknown> | FormData | Blob | undefined;

async function request<T>(method: string, url: string, body?: Body, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body instanceof Blob) {
    payload = body;
    headers["Content-Type"] = body.type || "application/octet-stream";
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: "same-origin", signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError("Can't reach the Memory Assistant server.", 0);
  }

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const message =
      (data as { error?: string } | null)?.error ??
      (res.status >= 500 ? "The server had a problem. Please try again." : `Request failed (${res.status}).`);
    if (res.status === 401) window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, { detail: { url } }));
    const retry = Number(res.headers.get("Retry-After")) || undefined;
    throw new ApiError(message, res.status, retry);
  }
  return data as T;
}

function personForm(input: PersonInput, photos: File[]): FormData {
  const form = new FormData();
  (Object.keys(input) as Array<keyof PersonInput>).forEach((k) => form.append(k, input[k]));
  photos.forEach((p) => form.append("photos", p, p.name));
  return form;
}

export const api = {
  // Session
  session: () => request<SessionInfo>("GET", "/api/session"),
  caregiverLogin: (password: string) => request<{ ok: true }>("POST", "/api/caregiver/login", { password }),
  caregiverLogout: () => request<{ ok: true }>("POST", "/api/caregiver/logout"),
  patientLogin: (pin: string) => request<{ ok: true }>("POST", "/api/patient/login", { pin }),

  // Patient screen (existing endpoints)
  currentPerson: (signal?: AbortSignal) => request<CurrentPerson>("GET", "/api/current-person", undefined, signal),
  sendFrame: (jpeg: Blob, signal?: AbortSignal) => request<FrameResult>("POST", "/api/frame", jpeg, signal),
  saveMemory: (personId: string, summary: string) =>
    request<{ message: string }>("POST", "/api/save-memory", { person_id: personId, summary }),
  uploadAudio: (personId: string, audio: Blob) => {
    const form = new FormData();
    form.append("audio", audio, "recording.webm");
    form.append("person_id", personId);
    return request<{ message: string }>("POST", "/api/upload-audio", form);
  },
  stats: () => request<Stats>("GET", "/api/stats"),
  status: () => request<AppStatus>("GET", "/api/status"),
  personPhotoUrl: (personId: string, version?: string | null) =>
    `/api/people/${encodeURIComponent(personId)}/photo${version ? `?v=${encodeURIComponent(version)}` : ""}`,

  // Caregiver
  people: () => request<Person[]>("GET", "/api/caregiver/people"),
  person: (id: string) => request<PersonDetail>("GET", `/api/caregiver/people/${encodeURIComponent(id)}`),
  createPerson: (input: PersonInput, photos: File[]) =>
    request<SavePersonResult>("POST", "/api/caregiver/people", personForm(input, photos)),
  updatePerson: (id: string, input: PersonInput, photos: File[]) =>
    request<SavePersonResult>("PUT", `/api/caregiver/people/${encodeURIComponent(id)}`, personForm(input, photos)),
  deletePerson: (id: string) => request<{ ok: true }>("DELETE", `/api/caregiver/people/${encodeURIComponent(id)}`),

  memories: (personId?: string) =>
    request<Memory[]>(
      "GET",
      personId ? `/api/caregiver/memories?person_id=${encodeURIComponent(personId)}` : "/api/caregiver/memories",
    ),
  addMemory: (personId: string, summary: string) =>
    request<Memory>("POST", "/api/caregiver/memories", { person_id: personId, summary }),
  deleteMemory: (id: number) => request<{ ok: true }>("DELETE", `/api/caregiver/memories/${id}`),

  visits: (limit = 200) => request<Visit[]>("GET", `/api/caregiver/visits?limit=${limit}`),
  analytics: () => request<Analytics>("GET", "/api/caregiver/analytics"),

  // Family album — patient read-only
  family: () => request<FamilyMember[]>("GET", "/api/family"),
  familyMember: (id: string, signal?: AbortSignal) =>
    request<FamilyMemberDetail>("GET", `/api/family/${encodeURIComponent(id)}`, undefined, signal),
  album: () => request<Album>("GET", "/api/album"),
  photoUrl: (photoId: string) => `/api/photos/${encodeURIComponent(photoId)}/image`,

  // Family album — caregiver management
  photos: (personId?: string) =>
    request<FamilyPhoto[]>(
      "GET",
      personId ? `/api/caregiver/photos?person_id=${encodeURIComponent(personId)}` : "/api/caregiver/photos",
    ),
  uploadPhotos: (files: File[], details: PhotoDetailsInput) => {
    const form = new FormData();
    files.forEach((f) => form.append("photos", f, f.name));
    form.append("caption", details.caption);
    form.append("story", details.story);
    form.append("taken_on", details.taken_on);
    if (details.memory_id !== null) form.append("memory_id", String(details.memory_id));
    details.person_ids.forEach((id) => form.append("person_ids", id));
    return request<UploadPhotosResult>("POST", "/api/caregiver/photos", form);
  },
  updatePhoto: (id: string, details: PhotoDetailsInput) =>
    request<FamilyPhoto>("PUT", `/api/caregiver/photos/${encodeURIComponent(id)}`, { ...details }),
  deletePhoto: (id: string) => request<{ ok: true }>("DELETE", `/api/caregiver/photos/${encodeURIComponent(id)}`),
  setProfilePhoto: (personId: string, photoId: string | null) =>
    request<{ ok: true }>("PUT", `/api/caregiver/people/${encodeURIComponent(personId)}/profile-photo`, {
      photo_id: photoId,
    }),

  enrollCapture: (personId: string, frame: Blob | null) => {
    const form = new FormData();
    if (frame) form.append("frame", frame, "frame.jpg");
    return request<EnrollCaptureResult>("POST", `/caregiver/enroll/${encodeURIComponent(personId)}/capture`, form);
  },
};

export type Api = typeof api;
