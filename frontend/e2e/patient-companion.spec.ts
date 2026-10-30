import { expect, test } from "@playwright/test";
import { horizontalOverflow, idle, john, mockBackend, runAxe, sarah, unknownFace } from "./mockApi";

// Explicit viewports from the Phase 3 brief; run once (desktop project).
test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "viewports are set explicitly below"));

const WIDTHS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
  { name: "375", width: 375, height: 812 },
];

for (const vp of WIDTHS) {
  test(`patient companion at ${vp.name}px: visitor, family, memories`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await mockBackend(page, { sequence: [sarah] });
    await page.setViewportSize({ width: vp.width, height: vp.height });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "This is Sarah Johnson" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Photos with Sarah" })).toBeVisible();
    await page.waitForTimeout(300);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(await runAxe(page)).toEqual([]);
    await page.screenshot({ path: `test-results/companion-${vp.name}-home.png`, fullPage: true });

    await page.goto("/family");
    await expect(page.getByRole("heading", { level: 1, name: "Family and friends" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(await runAxe(page)).toEqual([]);
    await page.screenshot({ path: `test-results/companion-${vp.name}-family.png`, fullPage: true });

    await page.goto(`/family/${sarah.person_id}`);
    await expect(page.getByText(/This doesn't mean Sarah is here/)).toBeVisible();
    expect(await runAxe(page)).toEqual([]);
    await page.screenshot({ path: `test-results/companion-${vp.name}-person.png`, fullPage: true });

    await page.goto("/memories");
    await expect(page.getByRole("heading", { name: "Whitby beach" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

test("visitor changes in the live feed: photos, name and audio follow the person", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __spoken: string[] }).__spoken = [];
    window.speechSynthesis.speak = (u) => {
      (window as unknown as { __spoken: string[] }).__spoken.push(u.text);
    };
  });
  await mockBackend(page, { sequence: [sarah, sarah, sarah, sarah, john, john, unknownFace, unknownFace, idle] });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");

  await expect(page.getByRole("region", { name: "Photos with Sarah" })).toBeVisible();
  await page.getByRole("button", { name: "Read aloud" }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

  await expect(page.getByRole("heading", { name: "This is John Smith" })).toBeVisible();
  await expect(page.locator("#visitor")).not.toContainText("Sarah");
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0); // previous visitor's audio ended

  await expect(page.getByRole("heading", { name: "I don't recognise this person" })).toBeVisible();
  await expect(page.locator("#visitor")).not.toContainText(/John|Sarah|Whitby/);
  await expect(page.getByRole("heading", { name: "Waiting for a visitor" })).toBeVisible();
});

test("access boundary: the patient app needs the PIN, the public homepage does not", async ({ page }) => {
  await page.route("**/api/**", (r) =>
    r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Not signed in" }) }),
  );
  await page.goto("/");
  await expect(page).toHaveURL(/\/patient\/login$/);
  await expect(page.getByRole("heading", { name: "Set up this screen" })).toBeVisible();
  await page.getByRole("link", { name: "What is Memory Assistant?" }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Every familiar face");
});
