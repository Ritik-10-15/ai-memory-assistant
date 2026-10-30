import { expect, test, type Page } from "@playwright/test";
import { ALBUM_ID, horizontalOverflow, idle, maybeSarah, mockBackend, runAxe, sarah, unknownFace } from "./mockApi";

const WIDTHS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
  { name: "375", width: 375, height: 812 },
];

/** Tab through the first `stops` controls; each must show a visible focus indicator. */
async function focusIsAlwaysVisible(page: Page, stops: number) {
  for (let i = 0; i < stops; i++) {
    await page.keyboard.press("Tab");
    const visible = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return true;
      const s = getComputedStyle(el);
      const outline = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
      return outline || s.boxShadow !== "none";
    });
    expect(visible, `focus indicator on tab stop ${i + 1}`).toBe(true);
  }
}

// Fixed viewport sizes: one browser project is enough.
test.describe("patient app at every width (Phase 6)", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "viewport sizes are set explicitly"));

  for (const vp of WIDTHS) {
    test(`every patient screen fits ${vp.name}px, passes axe, and shows focus`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const states: Array<[string, typeof sarah, string]> = [
        ["known", sarah, "This is Sarah Johnson"],
        ["uncertain", maybeSarah, "This might be Sarah Johnson"],
        ["unknown", unknownFace, "I don't recognise this person"],
      ];
      for (const [name, who, heading] of states) {
        await page.unrouteAll();
        await mockBackend(page, { sequence: [who] });
        await page.goto("/");
        await expect(page.getByRole("heading", { name: heading })).toBeVisible();
        expect(await horizontalOverflow(page), `home (${name}) overflows`).toBeLessThanOrEqual(0);
        expect(await runAxe(page), `home (${name})`).toEqual([]);
        await page.screenshot({ path: `test-results/phase6/patient-${name}-${vp.name}.png`, fullPage: true });
      }
      await page.unrouteAll();
      await mockBackend(page, { sequence: [idle] });
      for (const [name, path, heading] of [
        ["family", "/family", "Family and friends"],
        ["person", `/family/${sarah.person_id}`, "Sarah Johnson"],
        ["memories", "/memories", "Memories"],
        ["albums", "/albums", "Photo albums"],
        ["album", `/albums/${ALBUM_ID}`, "Whitby summers"],
      ]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
        expect(await horizontalOverflow(page), `${name} overflows`).toBeLessThanOrEqual(0);
        expect(await runAxe(page), name).toEqual([]);
      }
      await page.goto("/family");
      await expect(page.getByRole("heading", { name: "Family and friends" })).toBeVisible();
      await focusIsAlwaysVisible(page, 8);
    });
  }

  test("caregiver and homepage show focus on every early tab stop", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await mockBackend(page, { caregiver: true, sequence: [idle] });
    for (const path of ["/welcome", "/caregiver", "/caregiver/albums"]) {
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");
      await focusIsAlwaysVisible(page, 10);
    }
  });
});
