import { expect, test, type Page } from "@playwright/test";
import { horizontalOverflow, mockBackend, runAxe } from "./mockApi";

// The homepage sets its own viewport sizes, so run it once (desktop project).
test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "viewports are set explicitly below"));

const WIDTHS = [
  { name: "1920", width: 1920, height: 1080 },
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
  { name: "430", width: 430, height: 932 },
  { name: "375", width: 375, height: 812 },
];

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

for (const vp of WIDTHS) {
  test(`homepage at ${vp.name}px: renders, fits, accessible`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/welcome");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Every familiar face");
    // Let entrance animations settle before measuring and scanning.
    await page.evaluate(() => document.querySelectorAll(".site-reveal").forEach((el) => el.setAttribute("data-visible", "true")));
    await page.waitForTimeout(700);
    expect(await horizontalOverflow(page), "no sideways scrolling").toBeLessThanOrEqual(0);
    expect(await runAxe(page)).toEqual([]);
    await page.screenshot({ path: `test-results/site-${vp.name}-hero.png` });
    await page.screenshot({ path: `test-results/site-${vp.name}-full.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

test("navigation scrolls to each section and marks it active", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/welcome");
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const [label, id] of [["How it works", "how-it-works"], ["Features", "features"], ["About", "about"]] as const) {
    await nav.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    await expect(page.locator(`#${id}`)).toBeInViewport();
    await expect(nav.getByRole("link", { name: label })).toHaveAttribute("aria-current", "location");
  }
  await nav.getByRole("link", { name: "Try demo" }).click();
  await expect(page.locator("#demo")).toBeInViewport();
});

test("mobile menu works by touch and keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/welcome");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.locator("#site-menu").getByRole("link", { name: "Features" }).click();
  await expect(page.locator("#site-menu")).toBeHidden();
  await expect(page.locator("#features")).toBeInViewport();

  const toggle = page.getByRole("button", { name: "Open menu" });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#site-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#site-menu")).toBeHidden();
  await expect(toggle).toBeFocused();
});

test("demo switches scenarios and never guesses a name", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const camera: string[] = [];
  await page.exposeFunction("__cameraUsed", () => camera.push("used"));
  await page.addInitScript(() => {
    const orig = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (orig) navigator.mediaDevices.getUserMedia = (c) => ((window as unknown as { __cameraUsed: () => void }).__cameraUsed(), orig(c));
  });
  const apiCalls: string[] = [];
  page.on("request", (r) => r.url().includes("/api/") && apiCalls.push(r.url()));

  await page.goto("/welcome");
  await page.getByRole("link", { name: /Explore the demo/ }).click();
  const demo = page.locator("section", { has: page.locator("#demo") });
  await expect(demo.getByText("Simulation / Demo mode")).toBeVisible();
  await expect(demo.getByText("This is Daniel Hughes")).toBeVisible();

  await demo.getByRole("radio", { name: "Someone new" }).click();
  await expect(demo.getByText("I don't recognise this person")).toBeVisible();
  await expect(demo.getByText("Daniel Hughes")).toHaveCount(0);
  await demo.screenshot({ path: "test-results/site-demo-unknown.png" });

  await demo.getByRole("radio", { name: "Possible match" }).click();
  await expect(demo.getByText("This might be Daniel")).toBeVisible();
  await demo.screenshot({ path: "test-results/site-demo-uncertain.png" });

  expect(camera, "the public demo must not open the camera").toEqual([]);
  expect(apiCalls, "the public demo must not call the backend").toEqual([]);
});

test("caregiver login link opens the real sign-in page", async ({ page }) => {
  await mockBackend(page, { caregiver: false });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/welcome");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /Caregiver login/ }).click();
  await expect(page).toHaveURL(/\/caregiver\/login$/);
  await expect(page.getByRole("heading", { name: "Caregiver sign-in" })).toBeVisible();
});
