import { expect, test } from "@playwright/test";
import { horizontalOverflow, mockBackend, runAxe } from "./mockApi";

test.describe("caregiver workspace", () => {
  test("sign-in: wrong password is refused, right one opens the overview", async ({ page }) => {
    await mockBackend(page, { caregiver: false });
    await page.goto("/caregiver");
    await expect(page).toHaveURL(/\/caregiver\/login/);
    await page.getByLabel("Password").fill("nope");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toContainText("Incorrect");
    await page.getByLabel("Password").fill("correct-horse");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  });

  test("overview and people fit every screen size", async ({ page }) => {
    await mockBackend(page, { caregiver: true });
    await page.goto("/caregiver");
    await expect(page.getByRole("heading", { name: "Needs face enrollment" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/caregiver-overview-${test.info().project.name}.png`, fullPage: true });

    await page.goto("/caregiver/people");
    await expect(page.getByRole("heading", { name: "Sarah Johnson" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/caregiver-people-${test.info().project.name}.png`, fullPage: true });
  });

  test("navigation works on small screens through the menu button", async ({ page }) => {
    await mockBackend(page, { caregiver: true });
    await page.goto("/caregiver");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    const menu = page.getByRole("button", { name: "Open menu" });
    test.skip(!(await menu.isVisible()), "sidebar is always visible on wide screens");
    await menu.click();
    await page.getByRole("navigation", { name: "Caregiver" }).getByRole("link", { name: "Visit history" }).click();
    await expect(page.getByRole("heading", { name: "Visit history" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false");
  });

  test("visit history renders charts and a table alternative", async ({ page }) => {
    await mockBackend(page, { caregiver: true });
    await page.goto("/caregiver/visits");
    await expect(page.getByRole("heading", { name: "Visits per day" })).toBeVisible();
    await page.getByRole("button", { name: "Show table" }).first().click();
    await expect(page.getByRole("columnheader", { name: "Day" })).toBeVisible();
    const timeline = page.getByRole("region", { name: "Timeline" });
    await expect(timeline.getByRole("listitem").getByText("Sarah Johnson", { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/caregiver-visits-${test.info().project.name}.png`, fullPage: true });
  });

  test("no WCAG 2.2 AA violations on caregiver pages", async ({ page }) => {
    await mockBackend(page, { caregiver: true });
    for (const [path, heading] of [
      ["/caregiver", "Needs face enrollment"],
      ["/caregiver/people", "Sarah Johnson"],
      ["/caregiver/memories", "Memories"],
      ["/caregiver/visits", "Visits per day"],
      ["/caregiver/settings", "Settings"],
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
      expect(await runAxe(page), path).toEqual([]);
    }
  });
});
