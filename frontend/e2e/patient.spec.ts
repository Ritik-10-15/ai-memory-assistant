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
    await expect(page.getByRole("region", { name: "Camera", exact: true }).getByText("Camera on")).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/patient-known-${test.info().project.name}.png`, fullPage: true });
  });

  test("uncertain match is phrased as a question with no memories", async ({ page }) => {
    await mockBackend(page, { sequence: [maybeSarah] });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "This might be Sarah Johnson" })).toBeVisible();
    // The visitor panel shows none of Sarah's memories. (The separate "A memory
    // to enjoy" card picks one memory per day of the year, unrelated to who is
    // in view; on some dates it is Sarah's, so the whole page is not checked.)
    const visitor = page.locator("#visitor");
    await expect(visitor).toContainText("This might be Sarah Johnson");
    await expect(visitor.getByText(sarah.last_memory!)).toHaveCount(0);
    await expect(visitor.getByRole("button", { name: "Read aloud" })).toHaveCount(0);
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
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
    const readAloud = page.getByRole("button", { name: "Read aloud" });
    for (let i = 0; i < 14 && !(await readAloud.evaluate((el) => el === document.activeElement)); i++) {
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
      await expect(page.locator("#visitor h3").first()).toBeVisible();
      expect(await runAxe(page), `state ${state.state}`).toEqual([]);
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
  });

  test("family album, a loved one's page, and memories to explore", async ({ page }) => {
    await mockBackend(page, { sequence: [idle] });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Waiting for a visitor" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "A memory to enjoy" })).toBeVisible();
    await page.screenshot({ path: `test-results/patient-home-${test.info().project.name}.png`, fullPage: true });

    const nav = page.getByRole("navigation", { name: /^Main/ }).filter({ visible: true });
    await nav.getByRole("link", { name: "Family" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Family and friends" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/patient-family-${test.info().project.name}.png`, fullPage: true });

    await page.getByRole("link", { name: /Sarah Johnson/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sarah Johnson" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Memories with Sarah" })).toBeVisible();
    await page.screenshot({ path: `test-results/patient-person-${test.info().project.name}.png`, fullPage: true });

    await nav.getByRole("link", { name: "Memories" }).click();
    await expect(page.getByRole("heading", { name: "Whitby beach" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/patient-memories-${test.info().project.name}.png`, fullPage: true });

    await page.getByRole("button", { name: "Look together" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("dialog").getByText("2 of 4")).toBeVisible();
    await page.screenshot({ path: `test-results/patient-look-together-${test.info().project.name}.png` });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("a visitor arriving while browsing is announced gently", async ({ page }) => {
    await mockBackend(page, { sequence: [idle, idle, sarah] });
    await page.goto("/memories");
    await expect(page.getByText("Sarah Johnson is here")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Memories" })).toBeVisible();
    await page.getByRole("button", { name: "See who's visiting" }).click();
    await expect(page.getByRole("heading", { name: "This is Sarah Johnson" })).toBeVisible();
  });

  test("no WCAG 2.2 AA violations on family and memories pages", async ({ page }) => {
    await mockBackend(page, { sequence: [idle] });
    for (const [path, heading] of [
      ["/family", "Family and friends"],
      [`/family/${sarah.person_id}`, "Memories with Sarah"],
      ["/memories", "Whitby beach"],
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      expect(await runAxe(page), path).toEqual([]);
    }
  });
});
