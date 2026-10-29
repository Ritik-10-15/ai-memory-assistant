import { expect, test } from "@playwright/test";
import { horizontalOverflow, idle, john, maybeSarah, mockBackend, runAxe, sarah, unknownFace } from "./mockApi";

test.describe("patient screen", () => {
  test("recognised visitor: name, relationship, memory, read-aloud; fits the screen", async ({ page }) => {
    await mockBackend(page, { sequence: [sarah] });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "This is Sarah Johnson" })).toBeVisible();
    await expect(page.getByText("Your daughter", { exact: true })).toBeVisible();
    await expect(page.getByText("Recognised", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Read aloud" })).toBeVisible();
    // The real browser camera (fake device) is running and streaming frames.
    await expect(page.getByText("Camera on")).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/patient-known-${test.info().project.name}.png`, fullPage: true });
  });

  test("uncertain match is phrased as a question with no memories", async ({ page }) => {
    await mockBackend(page, { sequence: [maybeSarah] });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "This might be Sarah Johnson" })).toBeVisible();
    await expect(page.getByText(sarah.last_memory!)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Read aloud" })).toHaveCount(0);
    await page.screenshot({ path: `test-results/patient-uncertain-${test.info().project.name}.png`, fullPage: true });
  });

  test("visitor changes, then leaves: no stale name remains", async ({ page }) => {
    await mockBackend(page, { sequence: [sarah, sarah, john, john, unknownFace, unknownFace, idle] });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "This is Sarah Johnson" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "This is John Smith" })).toBeVisible();
    await expect(page.locator("#visitor")).not.toContainText("Sarah");
    await expect(page.getByRole("heading", { name: "I don't recognise this person" })).toBeVisible();
    await expect(page.locator("#visitor")).not.toContainText("John");
    await expect(page.getByRole("heading", { name: "Waiting for a visitor" })).toBeVisible();
  });

  test("camera blocked shows a clear camera-unavailable state", async ({ browser }) => {
    const context = await browser.newContext({ permissions: [] });
    const page = await context.newPage();
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    });
    await mockBackend(page, { sequence: [sarah] });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "The camera isn't working" })).toBeVisible();
    await expect(page.getByText(/Camera access is turned off/)).toBeVisible();
    await expect(page.locator("#visitor")).not.toContainText("Sarah");
    await context.close();
  });

  test("service outage hides the identity", async ({ page }) => {
    await mockBackend(page, { sequence: [sarah] });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "This is Sarah Johnson" })).toBeVisible();
    await page.route("**/api/current-person", (r) => r.abort("connectionrefused"));
    await expect(page.getByRole("heading", { name: "I can't connect right now" })).toBeVisible();
    await expect(page.locator("#visitor")).not.toContainText("Sarah");
  });

  test("keyboard: skip link first, visible focus, Read aloud reachable", async ({ page }) => {
    await mockBackend(page, { sequence: [sarah] });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "This is Sarah Johnson" })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to visitor information" })).toBeFocused();
    const readAloud = page.getByRole("button", { name: "Read aloud" });
    for (let i = 0; i < 6 && !(await readAloud.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press("Tab");
    }
    await expect(readAloud).toBeFocused();
    const outline = await readAloud.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe("none");
  });

  test("no WCAG 2.2 AA violations (including colour contrast)", async ({ page }) => {
    for (const state of [sarah, maybeSarah, unknownFace, idle]) {
      await mockBackend(page, { sequence: [state] });
      await page.goto("/");
      await expect(page.locator("#visitor h2").first()).toBeVisible();
      expect(await runAxe(page), `state ${state.state}`).toEqual([]);
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
  });
});
