import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type BrowserContext, type CDPSession, type Page } from "@playwright/test";

/**
 * Phase 8 browser measurements (see playwright.perf.config.ts). Lab numbers
 * from one machine — not real-user data. Every value written to the results
 * file is measured here; nothing is estimated.
 */
const FACE = process.env.LIVE_FACE_IMAGE;
test.skip(!FACE, "set LIVE_FACE_IMAGE to a photo of one person facing the camera");

const LABEL = process.env.PERF_LABEL ?? "run";
const PIN = "2468";
const PASSWORD = "perf-pass-1234";
const results: Record<string, unknown> = { label: LABEL, date: new Date().toISOString() };

test.afterAll(() => {
  const dir = fileURLToPath(new URL("../../docs/benchmarks/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}frontend-${LABEL}.json`, JSON.stringify(results, null, 1));
});

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN;
};
const round = (n: number) => Math.round(n * 10) / 10;

/** Canvas "camera" showing the face photo or an empty scene (window.__scene). */
async function fakeCamera(context: BrowserContext) {
  const face = `data:image/jpeg;base64,${readFileSync(FACE!).toString("base64")}`;
  await context.addInitScript((src) => {
    const w = window as unknown as Record<string, unknown>;
    w.__scene = "face";
    const img = new Image();
    img.src = src;
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d")!;
    setInterval(() => {
      if (w.__scene === "face" && img.complete) ctx.drawImage(img, 0, 0, 640, 480);
      else {
        ctx.fillStyle = "#c8c8c8";
        ctx.fillRect(0, 0, 640, 480);
      }
    }, 50);
    navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(15);
    window.speechSynthesis.speak = () => undefined;
  }, face);
}

/** Collect LCP, CLS and Event Timing entries from the very start of each page. */
async function vitalsObserver(context: BrowserContext) {
  await context.addInitScript(() => {
    const v = { lcp: 0, cls: 0, events: [] as Array<{ name: string; duration: number }> };
    (window as unknown as { __vitals: typeof v }).__vitals = v;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) v.lcp = Math.max(v.lcp, e.startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>)
        if (!e.hadRecentInput) v.cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as unknown as Array<{ name: string; duration: number; interactionId?: number }>)
        if (e.interactionId) v.events.push({ name: e.name, duration: e.duration });
    }).observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
  });
}

async function signInPatient(page: Page) {
  await page.goto("/patient/login");
  await page.getByLabel("PIN").fill(PIN);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((u) => u.pathname === "/");
}

async function signInCaregiver(page: Page) {
  const r = await page.request.post("/api/caregiver/login", { data: { password: PASSWORD } });
  expect(r.ok()).toBe(true);
}

async function metrics(cdp: CDPSession) {
  const { metrics: m } = await cdp.send("Performance.getMetrics");
  return Object.fromEntries(m.map((x) => [x.name, x.value]));
}

test("patient tablet: steady-state main-thread work, requests and memory", async ({ browser }) => {
  const context = await browser.newContext();
  await fakeCamera(context);
  const page = await context.newPage();
  await signInPatient(page);
  await expect(page.getByRole("heading", { name: "This is Visitor" })).toBeVisible({ timeout: 30_000 });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  const window_s = 60;
  for (const scene of ["face", "empty"] as const) {
    await page.evaluate((s) => ((window as unknown as { __scene: string }).__scene = s), scene);
    if (scene === "empty") await expect(page.getByRole("heading", { name: "This is Visitor" })).toBeHidden({ timeout: 30_000 });
    await page.waitForTimeout(3000);
    const counts: Record<string, number> = {};
    const onRequest = (r: { url: () => string }) => {
      const path = new URL(r.url()).pathname;
      const key = path.startsWith("/api/photos/") ? "/api/photos/*" : path.startsWith("/api/people/") ? "/api/people/*/photo" : path;
      counts[key] = (counts[key] ?? 0) + 1;
    };
    page.on("request", onRequest);
    const m0 = await metrics(cdp);
    await page.waitForTimeout(window_s * 1000);
    const m1 = await metrics(cdp);
    page.off("request", onRequest);
    const perMin = (k: string) => round(((m1[k] - m0[k]) * 1000 * 60) / window_s);
    results[`patient home, visitor ${scene === "face" ? "present" : "absent"} (per minute)`] = {
      main_thread_task_ms: perMin("TaskDuration"),
      script_ms: perMin("ScriptDuration"),
      layout_ms: perMin("LayoutDuration"),
      style_ms: perMin("RecalcStyleDuration"),
      layouts: Math.round(((m1.LayoutCount - m0.LayoutCount) * 60) / window_s),
      style_recalcs: Math.round(((m1.RecalcStyleCount - m0.RecalcStyleCount) * 60) / window_s),
      requests: Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, Math.round((n * 60) / window_s)])),
      js_heap_mb: round(m1.JSHeapUsedSize / 2 ** 20),
      dom_nodes: m1.Nodes,
      js_event_listeners: m1.JSEventListeners,
    };
  }
  await context.close();
});

test("visitor recognition, end to end in the browser", async ({ browser }) => {
  const context = await browser.newContext();
  await fakeCamera(context);
  const page = await context.newPage();
  await signInPatient(page);
  await expect(page.getByRole("heading", { name: "This is Visitor" })).toBeVisible({ timeout: 30_000 });
  const appear: number[] = [];
  const leave: number[] = [];
  // Scene change → the patient screen's text changes, timed inside the page.
  const until = (scene: string, wantVisible: boolean) =>
    page.evaluate(
      ([s, want]) =>
        new Promise<number>((resolve) => {
          (window as unknown as { __scene: string }).__scene = s as string;
          const t0 = performance.now();
          const check = () => {
            const shown = Array.from(document.querySelectorAll("h1,h2,h3,h4")).some((h) => h.textContent?.includes("This is Visitor"));
            if (shown === want) resolve(performance.now() - t0);
            else requestAnimationFrame(check);
          };
          check();
        }),
      [scene, wantVisible] as const,
    );
  for (let i = 0; i < 8; i++) {
    leave.push(await until("empty", false));
    await page.waitForTimeout(4000); // let the screen settle to "nobody here"
    appear.push(await until("face", true));
    await page.waitForTimeout(2000);
  }
  results["browser end-to-end (ms)"] = {
    appears_to_name_shown_median: round(median(appear)),
    appears_to_name_shown_max: round(Math.max(...appear)),
    leaves_to_name_removed_median: round(median(leave)),
    leaves_to_name_removed_max: round(Math.max(...leave)),
    runs: appear.length,
    appear,
    leave,
  };
  await context.close();
});

interface PageCase {
  name: string;
  path: string;
  who: "public" | "patient" | "caregiver";
  ready: (p: Page) => Promise<void>;
  interact?: (p: Page) => Promise<void>;
}

async function firstAlbumId(page: Page) {
  const r = await page.request.get("/api/albums");
  return ((await r.json()) as Array<{ id: string }>)[0].id;
}

const PAGES: PageCase[] = [
  {
    name: "homepage",
    path: "/welcome",
    who: "public",
    ready: (p) => expect(p.getByRole("heading", { level: 1 })).toBeVisible(),
    interact: async (p) => {
      await p.getByRole("link", { name: /Explore the demo/ }).first().click();
      await expect(p.getByText("Simulation / Demo mode")).toBeVisible();
    },
  },
  {
    name: "patient home (visitor present)",
    path: "/",
    who: "patient",
    ready: (p) => expect(p.getByRole("heading", { name: "This is Visitor" })).toBeVisible({ timeout: 30_000 }),
    interact: async (p) => {
      await p.getByRole("link", { name: "Family" }).first().click();
      await expect(p.getByRole("heading", { name: "Family and friends" })).toBeVisible();
    },
  },
  {
    name: "patient family",
    path: "/family",
    who: "patient",
    ready: (p) => expect(p.getByRole("heading", { name: "Family and friends" })).toBeVisible(),
  },
  {
    name: "patient album (30 photos)",
    path: "ALBUM",
    who: "patient",
    ready: (p) => expect(p.getByRole("heading", { level: 1 })).toBeVisible(),
    interact: async (p) => {
      await p.getByRole("button", { name: /^Look at/ }).first().click();
      await expect(p.getByRole("dialog")).toBeVisible();
    },
  },
  {
    name: "patient memories",
    path: "/memories",
    who: "patient",
    ready: (p) => expect(p.getByRole("heading", { name: "Memories" }).first()).toBeVisible(),
  },
  {
    name: "caregiver overview",
    path: "/caregiver",
    who: "caregiver",
    ready: (p) => expect(p.getByRole("heading", { name: "Overview" })).toBeVisible(),
    interact: async (p) => {
      // Keyboard, so the sticky mobile header cannot intercept the click.
      await p.getByRole("link", { name: "Visit history" }).first().focus();
      await p.keyboard.press("Enter");
      await expect(p.getByRole("heading", { name: "Visit history" })).toBeVisible();
    },
  },
  {
    name: "caregiver loved ones (31 people)",
    path: "/caregiver/people",
    who: "caregiver",
    ready: (p) => expect(p.getByRole("heading", { name: "Loved ones" })).toBeVisible(),
  },
  {
    name: "caregiver visit history",
    path: "/caregiver/visits",
    who: "caregiver",
    ready: (p) => expect(p.getByRole("heading", { name: "Visit history" })).toBeVisible(),
  },
];

for (const profile of [
  { name: "desktop", viewport: { width: 1280, height: 900 }, cpu: 1 },
  { name: "mobile (4x CPU slowdown)", viewport: { width: 412, height: 915 }, cpu: 4 },
]) {
  test(`page loads and interactions — ${profile.name}`, async ({ browser }) => {
    const out: Record<string, unknown> = {};
    for (const c of PAGES) {
      const runs: Array<Record<string, number>> = [];
      for (let run = 0; run < 3; run++) {
        const context = await browser.newContext({ viewport: profile.viewport, isMobile: profile.cpu > 1, hasTouch: profile.cpu > 1 });
        await fakeCamera(context);
        await vitalsObserver(context);
        const page = await context.newPage();
        if (c.who === "patient") await signInPatient(page);
        if (c.who === "caregiver") await signInCaregiver(page);
        const path = c.path === "ALBUM" ? `/albums/${await firstAlbumId(page)}` : c.path;
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: true }); // cold load every run
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
        await page.goto(path);
        await c.ready(page);
        await page.waitForTimeout(1500);
        const load = await page.evaluate(() => {
          const res = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
          const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
          const fcp = performance.getEntriesByName("first-contentful-paint")[0];
          const sum = (f: (r: PerformanceResourceTiming) => boolean) =>
            res.filter(f).reduce((a, r) => a + r.transferSize, 0);
          const v = (window as unknown as { __vitals: { lcp: number; cls: number } }).__vitals;
          return {
            lcp_ms: v.lcp,
            cls: v.cls,
            fcp_ms: fcp?.startTime ?? NaN,
            dom_content_loaded_ms: nav.domContentLoadedEventEnd,
            js_kb: sum((r) => r.initiatorType === "script" || r.name.endsWith(".js")) / 1024,
            css_kb: sum((r) => r.name.endsWith(".css")) / 1024,
            font_kb: sum((r) => /\.woff2?$/.test(r.name)) / 1024,
            image_kb: sum((r) => r.initiatorType === "img") / 1024,
            requests: res.length + 1,
          };
        });
        let inp = NaN;
        if (c.interact) {
          await c.interact(page);
          await page.waitForTimeout(500);
          inp = await page.evaluate(() =>
            Math.max(0, ...(window as unknown as { __vitals: { events: Array<{ duration: number }> } }).__vitals.events.map((e) => e.duration)),
          );
        }
        runs.push({ ...load, interaction_ms: inp });
        await context.close();
      }
      const keys = Object.keys(runs[0]);
      out[c.name] = Object.fromEntries(keys.map((k) => [k, k === "cls" ? Math.round(median(runs.map((r) => r[k])) * 1000) / 1000 : round(median(runs.map((r) => r[k])))]));
    }
    results[`page loads — ${profile.name} (median of 3 cold loads)`] = out;
  });
}

test("patient tablet soak: memory and listeners over time", async ({ browser }) => {
  test.skip(!process.env.PERF_SOAK_MIN, "set PERF_SOAK_MIN (minutes) to run the soak test");
  const minutes = Number(process.env.PERF_SOAK_MIN);
  test.setTimeout(minutes * 60_000 + 180_000);
  const context = await browser.newContext();
  await fakeCamera(context);
  const page = await context.newPage();
  await signInPatient(page);
  await expect(page.getByRole("heading", { name: "This is Visitor" })).toBeVisible({ timeout: 30_000 });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  const samples: Array<Record<string, number>> = [];
  const t0 = Date.now();
  let scene = "face";
  while (Date.now() - t0 < minutes * 60_000) {
    // A visitor arrives and leaves every 20 s.
    scene = scene === "face" ? "empty" : "face";
    await page.evaluate((s) => ((window as unknown as { __scene: string }).__scene = s), scene);
    await page.waitForTimeout(20_000);
    await cdp.send("HeapProfiler.collectGarbage");
    const m = await metrics(cdp);
    samples.push({
      minute: round((Date.now() - t0) / 60_000),
      js_heap_mb: round(m.JSHeapUsedSize / 2 ** 20),
      dom_nodes: m.Nodes,
      js_event_listeners: m.JSEventListeners,
      documents: m.Documents,
    });
  }
  results["patient tablet soak"] = { minutes, samples };
  await context.close();
});
