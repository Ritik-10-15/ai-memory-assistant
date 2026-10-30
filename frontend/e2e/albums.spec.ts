import { expect, test } from "@playwright/test";
import { ALBUM_ID, horizontalOverflow, idle, mockBackend, runAxe } from "./mockApi";

const WIDTHS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
  { name: "375", width: 375, height: 812 },
];

// These set their own viewport sizes, so one browser project is enough.
test.describe("photo albums (Phase 5)", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "viewport sizes are set explicitly"));

  for (const vp of WIDTHS) {
    test(`patient and caregiver album screens fit ${vp.name}px with no WCAG 2.2 AA violations`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await mockBackend(page, { caregiver: true, sequence: [idle] });
      const shots: Array<[string, string, string]> = [
        ["patient-albums", "/albums", "Photo albums"],
        ["patient-album", `/albums/${ALBUM_ID}`, "Whitby summers"],
        ["caregiver-albums", "/caregiver/albums", "Albums & photos"],
        ["caregiver-album-editor", `/caregiver/albums/${ALBUM_ID}`, "Photos in this album"],
        ["caregiver-library", "/caregiver/photos", "All photos"],
      ];
      for (const [name, path, heading] of shots) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
        // Not "networkidle": the patient screen polls recognition continuously.
        await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
        expect(await horizontalOverflow(page), `${name} overflows at ${vp.name}`).toBeLessThanOrEqual(0);
        expect(await runAxe(page), `${name} at ${vp.name}`).toEqual([]);
        await page.screenshot({ path: `test-results/phase5/${name}-${vp.name}.png`, fullPage: true });
      }

      // The full-screen viewer.
      await page.goto(`/albums/${ALBUM_ID}`);
      await page.getByRole("button", { name: "Look through the album" }).click();
      const viewer = page.getByRole("dialog", { name: "Whitby beach" });
      await expect(viewer).toBeVisible();
      await expect(viewer.getByText("You talked about the boats in the harbour.")).toBeVisible();
      expect(await runAxe(page), `viewer at ${vp.name}`).toEqual([]);
      await page.screenshot({ path: `test-results/phase5/patient-viewer-${vp.name}.png` });
    });
  }

  test("viewer: arrow keys move, Escape closes, focus returns to the page", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await mockBackend(page, { caregiver: true, sequence: [idle] });
    await page.goto(`/albums/${ALBUM_ID}`);
    const open = page.getByRole("button", { name: "Look through the album" });
    await open.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Whitby beach" })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("dialog", { name: "The rose garden" })).toBeVisible();
    await expect(page.getByText("Would you like to hear about the roses?")).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("dialog", { name: "Whitby beach" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(open).toBeFocused();
  });

  test("a hidden or deleted album is not available to the patient", async ({ page }) => {
    await mockBackend(page, { sequence: [idle] });
    await page.goto(`/albums/${"0".repeat(32)}`);
    await expect(page.getByText("This album isn't available")).toBeVisible();
  });

  test("caregiver album pages require sign-in", async ({ page }) => {
    await mockBackend(page, { caregiver: false });
    for (const path of ["/caregiver/albums", `/caregiver/albums/${ALBUM_ID}`]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/caregiver\/login/);
    }
  });

  test("reordering in the editor works from the keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockBackend(page, { caregiver: true });
    await page.goto(`/caregiver/albums/${ALBUM_ID}`);
    const down = page.getByRole("button", { name: /move Whitby beach later/ });
    await down.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("listitem").filter({ hasText: "Whitby beach" }).getByText("2.")).toBeVisible();
    await expect(down).toBeFocused();
  });
});
