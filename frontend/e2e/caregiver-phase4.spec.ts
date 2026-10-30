import { expect, test } from "@playwright/test";
import { horizontalOverflow, mockBackend, people, runAxe } from "./mockApi";

const sarahId = people[0].id;
const WIDTHS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
  { name: "375", width: 375, height: 812 },
];
const PAGES: Array<[string, string, string]> = [
  ["overview", "/caregiver", "Needs face enrollment"],
  ["people", "/caregiver/people", "Sarah Johnson"],
  ["profile", `/caregiver/people/${sarahId}`, "Memories"],
  ["enroll", "/caregiver/enroll", "Who are you enrolling?"],
  ["enroll-photos", `/caregiver/enroll/${people[1].id}`, "Add photos of John"],
  ["memories", "/caregiver/memories", "Memories"],
  ["visits", "/caregiver/visits", "Visits per day"],
  ["settings", "/caregiver/settings", "Display on this device"],
];

// These set their own viewport sizes, so one browser project is enough.
test.describe("caregiver platform (Phase 4)", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "viewport sizes are set explicitly"));

  for (const vp of WIDTHS) {
    test(`every caregiver page fits ${vp.name}px with no WCAG 2.2 AA violations`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await mockBackend(page, { caregiver: true });
      for (const [name, path, heading] of PAGES) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
        expect(await horizontalOverflow(page), `${name} overflows at ${vp.name}`).toBeLessThanOrEqual(0);
        expect(await runAxe(page), `${name} at ${vp.name}`).toEqual([]);
        await page.screenshot({ path: `test-results/phase4/${name}-${vp.name}.png`, fullPage: true });
      }
    });
  }

  test("directory → profile → edit memory → delete with confirmation, by keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockBackend(page, { caregiver: true });
    await page.goto("/caregiver/people");
    await page.getByRole("button", { name: "Face enrolled" }).click();
    await expect(page.getByText("Showing 1 of 2 people")).toBeVisible();
    await page.getByRole("link", { name: "Sarah Johnson", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Sarah Johnson" })).toBeVisible();

    await page.getByRole("button", { name: /^Edit memory from/ }).click();
    const box = page.getByLabel(/Edit memory from/);
    await expect(box).toBeFocused();
    await box.fill("You planted roses together.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("You planted roses together.")).toBeVisible();

    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Delete Sarah Johnson?" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await dialog.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page).toHaveURL(/\/caregiver\/people$/);
  });

  test("unknown profile shows a clear not-found state", async ({ page }) => {
    await mockBackend(page, { caregiver: true });
    await page.goto("/caregiver/people/00000000-0000-4000-8000-000000000000");
    await expect(page.getByRole("heading", { name: "Person not found" })).toBeVisible();
  });

  test("signed-out visitors are sent to sign-in from any caregiver page", async ({ page }) => {
    await mockBackend(page, { caregiver: false });
    for (const path of [`/caregiver/people/${sarahId}`, "/caregiver/enroll", "/caregiver/settings"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/caregiver\/login/);
    }
  });
});
