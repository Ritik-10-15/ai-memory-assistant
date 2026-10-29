import { createRequire } from "node:module";
import type { Page, Route } from "@playwright/test";
import type { AppStatus, CurrentPerson, Person } from "../src/api/types";
import { idle, john, maybeSarah, sarah, unknownFace } from "../src/test/fixtures";

export { idle, john, maybeSarah, sarah, unknownFace };

const require = createRequire(import.meta.url);
export const AXE_PATH = require.resolve("axe-core/axe.min.js");

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
  },
];

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
        return json(route, [
          { id: 1, person_id: people[0].id, person_name: "Sarah Johnson", relationship: "Daughter", started_at: "2026-10-20 14:30:00", ended_at: "2026-10-20 14:42:00", duration_s: 720, confidence: 0.71 },
        ]);
      case "GET /api/caregiver/memories":
        return json(route, [
          { id: 7, person_id: people[0].id, person_name: "Sarah Johnson", summary: "You talked about the roses.", raw_transcript: null, source: "manual", created_at: "2026-10-20 15:00:00" },
        ]);
      case "GET /api/caregiver/analytics":
        return json(route, {
          per_person: [{ person_id: people[0].id, name: "Sarah Johnson", visits: 5, avg_duration_s: 600, last_seen: "2026-10-20 14:30:00" }],
          daily: [{ day: new Date().toISOString().slice(0, 10), visits: 1 }],
          memory_sources: [{ source: "manual", count: 2 }],
        });
      default:
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
