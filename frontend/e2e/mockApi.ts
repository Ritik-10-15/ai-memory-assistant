import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Page, Route } from "@playwright/test";
import type { Album, AlbumSummary, AppStatus, CaregiverAlbum, CurrentPerson, FamilyMember, FamilyPhoto, Person } from "../src/api/types";
import { idle, john, maybeSarah, photoExtras, sarah, unknownFace } from "../src/test/fixtures";

export { idle, john, maybeSarah, sarah, unknownFace };

const require = createRequire(import.meta.url);
export const AXE_PATH = require.resolve("axe-core/axe.min.js");

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const IMAGES: Record<string, Buffer> = {
  ["b".repeat(32)]: fixture("beach.jpg"),
  ["g".repeat(32)]: fixture("garden.jpg"),
  ["l".repeat(32)]: fixture("lunch.jpg"),
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

export const browserStatus: AppStatus = {
  camera_mode: "browser",
  models_loaded: true,
  voice_memos: false,
  llm_summaries: false,
  enrolled_people: 2,
  gallery_embeddings: 14,
};

export const people: Person[] = [
  {
    id: sarah.person_id!,
    name: "Sarah Johnson",
    relationship: "Daughter",
    notes: "Visits on Sundays",
    dob: "",
    tts_greeting: "",
    created_at: "2026-09-01 10:00:00",
    memory_count: 2,
    visit_count: 5,
    last_visit_at: "2026-10-20 14:30:00",
    photo_count: 6,
    embedding_count: 6,
    profile_photo_id: null,
  },
  {
    id: john.person_id!,
    name: "John Smith",
    relationship: "Neighbour",
    notes: "",
    dob: "",
    tts_greeting: "",
    created_at: "2026-09-02 10:00:00",
    memory_count: 0,
    visit_count: 0,
    last_visit_at: null,
    photo_count: 0,
    embedding_count: 0,
    profile_photo_id: null,
  },
];

const visit = { id: 1, person_id: people[0].id, person_name: "Sarah Johnson", relationship: "Daughter", started_at: "2026-10-20 14:30:00", ended_at: "2026-10-20 14:42:00", duration_s: 720, confidence: 0.71 };
const memory = { id: 7, person_id: people[0].id, person_name: "Sarah Johnson", summary: "You talked about the roses.", raw_transcript: null, source: "manual", created_at: "2026-10-20 15:00:00" };

/**
 * Mock the backend. `sequence` is served by /api/current-person one poll at
 * a time (the last entry repeats).
 */
export async function mockBackend(
  page: Page,
  opts: { sequence?: CurrentPerson[]; caregiver?: boolean; status?: AppStatus } = {},
) {
  const sequence = opts.sequence ?? [idle];
  let poll = 0;
  let signedIn = opts.caregiver ?? false;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    switch (`${method} ${url.pathname}`) {
      case "GET /api/status":
        return json(route, opts.status ?? browserStatus);
      case "GET /api/current-person":
        return json(route, sequence[Math.min(poll++, sequence.length - 1)]);
      case "POST /api/frame":
        return json(route, { box: [220, 120, 200, 240], width: 640, height: 480 });
      case "GET /api/session":
        return json(route, { caregiver: signedIn, patient: true, patient_pin_required: true });
      case "POST /api/caregiver/login": {
        const ok = route.request().postDataJSON()?.password === "correct-horse";
        if (ok) signedIn = true;
        return ok ? json(route, { ok: true }) : json(route, { error: "Incorrect. Please try again." }, 401);
      }
      case "POST /api/caregiver/logout":
        signedIn = false;
        return json(route, { ok: true });
      case "GET /api/stats":
        return json(route, { total_people: 2, total_visits: 5, total_memories: 2, today_visits: 1 });
      case "GET /api/caregiver/people":
        return json(route, people);
      case "GET /api/caregiver/visits":
        return json(route, [visit]);
      case "GET /api/caregiver/memories":
        return json(route, [memory]);
      case "GET /api/caregiver/analytics":
        return json(route, {
          per_person: [{ person_id: people[0].id, name: "Sarah Johnson", visits: 5, avg_duration_s: 600, last_seen: "2026-10-20 14:30:00" }],
          daily: [{ day: new Date().toISOString().slice(0, 10), visits: 1 }],
          memory_sources: [{ source: "manual", count: 2 }],
        });
      case "GET /api/caregiver/photos":
        return json(route, albumPhotos);
      case "GET /api/albums":
        return json(route, [albumSummary, emptyAlbum]);
      case "GET /api/caregiver/albums":
        return json(route, [careAlbum, { ...emptyAlbum, cover_chosen: false, visible_to_patient: false, created_at: "2026-10-28 10:00:00" }]);
      case "GET /api/album":
        return json(route, album);
      case "GET /api/family":
        return json(route, family);
      default:
        if (url.pathname.startsWith("/api/family/")) {
          const person = family.find((f) => url.pathname.endsWith(f.id));
          if (!person) return json(route, { error: "Person not found." }, 404);
          return json(route, {
            person,
            memories: album.memories.filter((m) => m.person_id === person.id),
            photos: album.photos.filter((p) => p.people.some((x) => x.id === person.id)),
            visits: { count: 5, recent: ["2026-10-20 14:30:00"] },
          });
        }
        if (url.pathname.startsWith("/api/caregiver/people/")) {
          const person = people.find((p) => url.pathname.endsWith(p.id));
          if (!person) return json(route, { error: "Person not found." }, 404);
          if (method === "DELETE") return json(route, { ok: true });
          return json(route, {
            person,
            memories: person.memory_count ? [memory] : [],
            visits: person.visit_count ? [visit] : [],
          });
        }
        if (url.pathname.startsWith("/api/caregiver/memories/")) {
          if (method === "PUT") return json(route, { ...memory, summary: route.request().postDataJSON()?.summary ?? memory.summary });
          if (method === "DELETE") return json(route, { ok: true });
        }
        if (url.pathname.startsWith("/api/albums/")) {
          if (!url.pathname.endsWith(ALBUM_ID)) return json(route, { error: "Album not found." }, 404);
          return json(route, { album: albumSummary, photos: albumPhotos, total: albumPhotos.length, limit: 60, offset: 0 });
        }
        if (url.pathname.startsWith("/api/caregiver/albums/")) {
          if (!url.pathname.includes(ALBUM_ID)) return json(route, { error: "Album not found." }, 404);
          if (method === "DELETE" && url.pathname.endsWith(ALBUM_ID)) return json(route, { ok: true, deleted_photos: 0 });
          if (url.pathname.endsWith("/order")) {
            const ids: string[] = route.request().postDataJSON().photo_ids;
            return json(route, { album: careAlbum, photos: ids.map((id) => albumPhotos.find((x) => x.id === id)) });
          }
          return json(route, { album: careAlbum, photos: albumPhotos });
        }
        if (url.pathname.startsWith("/api/photos/")) {
          const img = IMAGES[url.pathname.split("/")[3]];
          return img ? route.fulfill({ body: img, contentType: "image/jpeg" }) : route.fulfill({ status: 404 });
        }
        if (url.pathname.startsWith("/api/people/")) return route.fulfill({ status: 404 });
        return json(route, { error: "not mocked" }, 404);
    }
  });
}

/** Fail the test if the page scrolls sideways (the layout must fit the viewport). */
export async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

export async function runAxe(page: Page) {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async () => {
    // @ts-expect-error — injected global
    const results = await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] });
    return results.violations.map(
      (v: { id: string; nodes: Array<{ target: string[] }> }) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    );
  });
}

export const family: FamilyMember[] = [
  {
    id: sarah.person_id!,
    name: "Sarah Johnson",
    relationship: "Daughter",
    description: "Lives in Leeds with her two boys. Loves gardening.",
    last_visit_at: "2026-10-20 14:30:00",
    photo_count: 2,
    recent_memory: { summary: "You talked about the roses in the back garden.", created_at: "2026-10-20 15:00:00" },
  },
  {
    id: john.person_id!,
    name: "John Smith",
    relationship: "Neighbour",
    description: "Lives next door. Brings the newspaper on Sundays.",
    last_visit_at: null,
    photo_count: 0,
    recent_memory: { summary: "You watched the football together.", created_at: "2026-10-25 10:00:00" },
  },
];

export const album: Album = {
  memories: [
    { id: 5, person_id: sarah.person_id!, person_name: "Sarah Johnson", relationship: "Daughter", summary: "You talked about the roses in the back garden. Sarah brought cuttings for the window box.", created_at: "2026-10-20 15:00:00", photo_id: "g".repeat(32) },
    { id: 6, person_id: john.person_id!, person_name: "John Smith", relationship: "Neighbour", summary: "You watched the football together and John made tea.", created_at: "2026-10-25 10:00:00", photo_id: null },
  ],
  photos: [
    { id: "b".repeat(32), caption: "Whitby beach", story: "A sunny day by the sea. We built a sandcastle and shared fish and chips on the harbour wall.", taken_on: "Summer 1998", memory_id: null, created_at: "2026-10-01 10:00:00", people: [{ id: sarah.person_id!, name: "Sarah Johnson", relationship: "Daughter" }], ...photoExtras },
    { id: "g".repeat(32), caption: "The rose garden", story: "", taken_on: "June 2026", memory_id: 5, created_at: "2026-10-20 15:05:00", people: [{ id: sarah.person_id!, name: "Sarah Johnson", relationship: "Daughter" }], ...photoExtras },
    { id: "l".repeat(32), caption: "Sunday lunch", story: "Roast dinner at the big table, with everyone home for the weekend.", taken_on: "Christmas 2019", memory_id: null, created_at: "2026-09-12 12:00:00", people: [], ...photoExtras },
  ],
};

// ── Photo albums (Phase 5) ──────────────────────────────────────────
export const ALBUM_ID = "a1".repeat(16);
const relationships = { [sarah.person_id!]: "Daughter", [john.person_id!]: "Neighbour" };
export const albumPhotos: FamilyPhoto[] = [
  {
    ...album.photos[0],
    location: "Whitby",
    category: "holiday",
    people: [
      { id: sarah.person_id!, name: "Sarah Johnson", relationship: relationships[sarah.person_id!] },
      { id: john.person_id!, name: "John Smith", relationship: relationships[john.person_id!] },
    ],
    memory: { id: 5, summary: "You talked about the boats in the harbour.", person_name: "Sarah Johnson", created_at: "2026-10-20 15:00:00" },
    memory_id: 5,
    albums: [{ id: ALBUM_ID, title: "Whitby summers" }],
  },
  { ...album.photos[1], memory_id: null, location: "Back garden", prompt: "Would you like to hear about the roses?", albums: [{ id: ALBUM_ID, title: "Whitby summers" }] },
  { ...album.photos[2], category: "family", albums: [{ id: ALBUM_ID, title: "Whitby summers" }] },
];
export const albumSummary: AlbumSummary = {
  id: ALBUM_ID,
  title: "Whitby summers",
  description: "Holidays by the sea, from the caravan years to the grandchildren's first visit.",
  cover_photo_id: albumPhotos[0].id,
  photo_count: albumPhotos.length,
  updated_at: "2026-10-28 10:00:00",
};
const emptyAlbum: AlbumSummary = {
  id: "e0".repeat(16),
  title: "Christmas",
  description: "",
  cover_photo_id: null,
  photo_count: 0,
  updated_at: "2026-10-27 10:00:00",
};
const careAlbum: CaregiverAlbum = { ...albumSummary, cover_chosen: false, visible_to_patient: true, created_at: "2026-10-01 10:00:00" };
