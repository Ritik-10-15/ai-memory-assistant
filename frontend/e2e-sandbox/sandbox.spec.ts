import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { runAxe } from "../e2e/mockApi";

/**
 * Two visitors, two private sandboxes, one real recognition engine. Visitor
 * A enrols a face and is recognised by their camera; visitor B shows the
 * same face to theirs and is told "I don't recognise this person", because
 * the face exists only in A's sandbox.
 */
const FACE = process.env.LIVE_FACE_IMAGE;
test.skip(!FACE, "set LIVE_FACE_IMAGE to a photo of one person facing the camera");
const PASSWORD = "sandbox-pass-1234";

async function fakeCamera(context: BrowserContext) {
  const face = `data:image/jpeg;base64,${readFileSync(FACE!).toString("base64")}`;
  await context.addInitScript((src) => {
    const img = new Image();
    img.src = src;
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d")!;
    setInterval(() => img.complete && ctx.drawImage(img, 0, 0, 640, 480), 50);
    navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(15);
    window.speechSynthesis.speak = () => undefined;
  }, face);
}

function watchForProblems(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text()) && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(e.message));
  return problems;
}

async function signUp(page: Page, username: string) {
  await page.goto("/welcome");
  await page.getByRole("link", { name: "Create a free sandbox" }).click();
  await expect(page.getByRole("heading", { name: "Try Memory Assistant yourself" })).toBeVisible();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByLabel(/I will only add my own face/).check();
  await page.getByRole("button", { name: "Create my sandbox" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible({ timeout: 30_000 });
}

test("two visitors, two private sandboxes, real recognition", async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  await fakeCamera(a);
  await fakeCamera(b);
  const pageA = await a.newPage();
  const pageB = await b.newPage();
  const problems = [...watchForProblems(pageA), ...watchForProblems(pageB)];

  await test.step("the sign-up and sign-in pages are accessible", async () => {
    // axe is injected as an inline script, which the app's CSP rightly blocks:
    // scan in a separate context that bypasses CSP (the visitors' contexts keep it).
    const scan = await browser.newContext({ bypassCSP: true });
    const page = await scan.newPage();
    for (const [path, heading] of [["/signup", "Try Memory Assistant yourself"], ["/signin", "Sign in to your sandbox"]]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      expect(await runAxe(page), path).toEqual([]);
    }
    await scan.close();
  });

  await test.step("visitor A signs up and finds the fictional family", async () => {
    await signUp(pageA, "visitor-a");
    await expect(pageA.getByText("visitor-a").first()).toBeVisible();
    await pageA.goto("/caregiver/people");
    for (const name of ["Ruth Hughes", "Daniel Hughes", "Margaret Ellis"]) {
      await expect(pageA.getByText(name).first()).toBeVisible();
    }
    await pageA.goto("/caregiver/albums");
    await expect(pageA.getByText("Cornwall summers").first()).toBeVisible();
    await expect(pageA.getByText("Days with Daniel").first()).toBeVisible();
  });

  await test.step("visitor A enrols a face and the patient screen recognises it", async () => {
    await pageA.goto("/caregiver/people/add");
    await pageA.getByLabel(/Full name/).fill("Robin Visitor");
    await pageA.getByLabel("Relationship to the patient").fill("Friend");
    await pageA.getByLabel("Face photos").setInputFiles(FACE!);
    await pageA.getByRole("button", { name: "Add person" }).click();
    await expect(pageA.getByText("Robin Visitor has been added.")).toBeVisible();
    await expect
      .poll(async () => (await pageA.request.get("/api/status")).json().then((s) => s.enrolled_people), { timeout: 30_000 })
      .toBe(1);
    await pageA.goto("/");
    await expect(pageA.getByRole("heading", { name: "This is Robin Visitor" })).toBeVisible({ timeout: 30_000 });
  });

  await test.step("visitor B has a separate sandbox: same face, not recognised", async () => {
    await signUp(pageB, "visitor-b");
    await pageB.goto("/caregiver/people");
    await expect(pageB.getByText("Ruth Hughes").first()).toBeVisible();
    await expect(pageB.getByText("Robin Visitor")).toHaveCount(0);
    await pageB.goto("/");
    await expect(pageB.getByRole("heading", { name: "I don't recognise this person" })).toBeVisible({ timeout: 30_000 });
    // ...while A, at the same moment, is still recognised on A's screen.
    await expect(pageA.getByRole("heading", { name: "This is Robin Visitor" })).toBeVisible();
  });

  await test.step("visitor A deletes their sandbox", async () => {
    await pageA.goto("/caregiver/settings");
    await pageA.getByRole("button", { name: "Delete my sandbox now" }).click();
    await pageA.getByRole("button", { name: "Delete everything" }).click();
    await expect(pageA).toHaveURL(/\/welcome$/);
    const r = await pageA.request.post("/api/account/login", { data: { username: "visitor-a", password: PASSWORD } });
    expect(r.status()).toBe(401);
    expect((await pageA.request.get("/api/caregiver/people")).status()).toBe(401);
  });

  await test.step("visitor B is unaffected", async () => {
    await pageB.goto("/caregiver/people");
    await expect(pageB.getByText("Ruth Hughes").first()).toBeVisible();
  });

  expect(problems).toEqual([]);
  await a.close();
  await b.close();
});
