import { expect, test, type Page } from "@playwright/test";
import { horizontalOverflow, runAxe } from "../e2e/mockApi";

/**
 * The public portfolio build: what a recruiter can do with no account, no
 * camera and no backend. Every request it makes must be for its own static
 * files; it must never ask for the camera or offer a way into the private app.
 */
function watch(page: Page) {
  const seen = { requests: [] as string[], camera: 0, errors: [] as string[] };
  page.on("request", (r) => seen.requests.push(new URL(r.url()).pathname));
  page.on("pageerror", (e) => seen.errors.push(e.message));
  return seen;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __cameraAsked: number };
    w.__cameraAsked = 0;
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = async () => {
        w.__cameraAsked++;
        throw new Error("no camera in the public demo");
      };
    }
  });
});

test("a visitor can understand the project, run the simulation and browse the albums", async ({ page }) => {
  const seen = watch(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Every familiar face");

  // The recognition demo, clearly labelled as a simulation.
  await page.getByRole("link", { name: /Explore the demo/ }).first().click();
  const demo = page.locator("section", { has: page.locator("#demo") });
  await expect(demo.getByText("Simulation / Demo mode")).toBeVisible();
  const next = demo.getByRole("button", { name: /^Next/ });
  for (let i = 0; i < 3; i++) await next.click();
  await expect(demo.locator("figure").getByText("This is Daniel Hughes")).toBeVisible();
  await demo.getByRole("radio", { name: /Different visitor/ }).click();
  for (let i = 0; i < 3; i++) await next.click();
  await expect(demo.locator("figure").getByText("This is Ruth Hughes")).toBeVisible();

  // Fictional albums: switch album, open a picture, step through.
  const albums = page.locator("section", { has: page.locator("#albums") });
  await albums.scrollIntoViewIfNeeded();
  await expect(albums.getByText("Fictional family · illustrations")).toBeVisible();
  await albums.getByRole("button", { name: /Days with Daniel/ }).click();
  await expect(albums.getByRole("button", { name: /Days with Daniel/ })).toHaveAttribute("aria-pressed", "true");
  await albums.getByRole("button", { name: "Show Rock pools" }).click();
  await expect(albums.getByRole("heading", { name: "Rock pools" })).toBeVisible();
  await albums.getByRole("button", { name: "Next" }).click();
  await expect(albums.getByRole("heading", { name: "Daniel turns eighteen" })).toBeVisible();
  await expect(albums.getByText("Picture 3 of 3")).toBeVisible();

  expect(seen.errors).toEqual([]);
  expect(seen.requests.filter((p) => p.startsWith("/api/") || p === "/video")).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __cameraAsked: number }).__cameraAsked)).toBe(0);
});

test("offers no way into the private app", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Caregiver login/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Patient screen" })).toHaveCount(0);
  await expect(page.getByText(/run privately and are not part of this site/)).toBeVisible();
  // Private paths just show the public homepage: there is nothing else here.
  await page.goto("/caregiver/login");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Every familiar face");
  await expect(page.getByLabel("Password")).toHaveCount(0);
});

test("fits the screen and passes WCAG 2.2 AA checks", async ({ page }) => {
  await page.goto("/");
  // Let the entrance fades finish (as in e2e/site.spec.ts) before measuring.
  await page.evaluate(() => document.querySelectorAll(".site-reveal").forEach((el) => el.setAttribute("data-visible", "true")));
  await page.waitForTimeout(700);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  expect(await runAxe(page)).toEqual([]);
});
