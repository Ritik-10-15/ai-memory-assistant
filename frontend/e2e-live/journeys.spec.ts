import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * The Phase 6 user journeys against the real backend (see
 * playwright.live.config.ts). The camera is a canvas showing the face photo
 * (or an empty scene), so recognition runs on real frames.
 */
const FACE = process.env.LIVE_FACE_IMAGE;
test.skip(!FACE, "set LIVE_FACE_IMAGE to a photo of one person facing the camera");

const PASSWORD = "live-pass-1234";

async function fakeCameraAndVoice(page: Page) {
  const face = `data:image/jpeg;base64,${readFileSync(FACE!).toString("base64")}`;
  await page.addInitScript((src) => {
    const w = window as unknown as Record<string, unknown>;
    w.__scene = "face";
    w.__spoken = [];
    const img = new Image();
    img.src = src;
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d")!;
    setInterval(() => {
      if (w.__scene === "face" && img.complete) ctx.drawImage(img, 0, 0, 640, 480);
      else {
        ctx.fillStyle = "#c8c8c8";
        ctx.fillRect(0, 0, 640, 480);
      }
    }, 50);
    navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(15);
    window.speechSynthesis.speak = (u) => {
      (w.__spoken as string[]).push(u.text);
    };
  }, face);
}

/** Fail on any Content-Security-Policy violation or uncaught page error. */
function watchForProblems(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(e.message));
  return problems;
}

test("the twelve user journeys, end to end", async ({ page, request }) => {
  await fakeCameraAndVoice(page);
  const problems = watchForProblems(page);

  await test.step("1. homepage and interactive demo (no backend data)", async () => {
    await page.goto("/welcome");
    await page.getByRole("link", { name: /Explore the demo/ }).first().click();
    await expect(page.getByText("Simulation / Demo mode")).toBeVisible();
  });

  await test.step("7. caregiver signs in", async () => {
    await page.goto("/caregiver");
    await expect(page).toHaveURL(/\/caregiver\/login/);
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  });

  let personUrl = "";
  await test.step("8. create a person with a face photo, then edit them", async () => {
    await page.goto("/caregiver/people/add");
    await page.getByLabel(/Full name/).fill("Robin Live");
    await page.getByLabel("Relationship to the patient").fill("Friend");
    await page.getByLabel("Face photos").setInputFiles(FACE!);
    await page.getByRole("button", { name: "Add person" }).click();
    await expect(page.getByText("Robin Live has been added.")).toBeVisible();
    personUrl = page.url();
    await page.getByRole("link", { name: "Edit details" }).click();
    await page.getByLabel("Relationship to the patient").fill("Old friend");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Changes saved.")).toBeVisible();
    await expect(page.getByText("Old friend").first()).toBeVisible();
    await page.getByLabel("Add a memory").fill("You talked about the allotment and the runner beans.");
    await page.getByRole("button", { name: "Save memory" }).click();
    await expect(page.getByText("You talked about the allotment and the runner beans.")).toBeVisible();
    // Enrolled faces are loaded by a background thread.
    await expect.poll(async () => (await page.request.get("/api/status")).json().then((s) => s.enrolled_people), { timeout: 20_000 }).toBe(1);
  });

  await test.step("9-10. upload a family photo into a new album", async () => {
    await page.goto("/caregiver/albums");
    await page.getByLabel(/Album name/).fill("Allotment days");
    await page.getByRole("button", { name: "Create album" }).click();
    await expect(page.getByText("Album created. Now add some photos.")).toBeVisible();
    await page.locator("#album-upload-files").setInputFiles(FACE!);
    await page.getByLabel("Title").fill("Robin at the allotment");
    await page.getByLabel("Where").fill("Allotment 14");
    await page.getByRole("checkbox", { name: /Robin Live/ }).check({ force: true });
    await page.getByRole("button", { name: "Upload to this album" }).click();
    await expect(page.getByText("1 of 1 photo added.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Robin at the allotment" })).toBeVisible();
  });

  await test.step("2-6. patient screen recognises Robin, shows their memory, reads it aloud", async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "This is Robin Live" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/old friend/i).first()).toBeVisible();
    await expect(page.getByText("You talked about the allotment and the runner beans.").first()).toBeVisible();
    await page.getByRole("button", { name: "Read aloud" }).click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.join(" "))).toContain("runner beans");
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByRole("button", { name: "Read aloud" })).toBeVisible();
  });

  await test.step("3. when Robin leaves, their memory disappears", async () => {
    await page.evaluate(() => ((window as unknown as Record<string, unknown>).__scene = "empty"));
    // The visitor section lets go of Robin. (The separate "A memory to enjoy"
    // card always features some memory for browsing; it isn't about who is here.)
    const visitor = page.getByRole("region", { name: "Who's visiting?" });
    await expect(visitor.getByText("You talked about the allotment and the runner beans.")).toHaveCount(0, { timeout: 20_000 });
    await expect(visitor.getByRole("heading", { name: "This is Robin Live" })).toHaveCount(0);
    await expect(visitor.getByText(/old friend/i)).toHaveCount(0);
  });

  await test.step("10. the patient opens the album and its viewer", async () => {
    await page.goto("/albums");
    await page.getByRole("link", { name: /Allotment days/ }).click();
    await page.getByRole("button", { name: "Look through the album" }).click();
    const viewer = page.getByRole("dialog", { name: "Robin at the allotment" });
    await expect(viewer.getByText(/Allotment 14/)).toBeVisible();
    await expect(viewer.getByText("Old friend")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
  });

  await test.step("11. the visit appears in the caregiver's history", async () => {
    await page.goto("/caregiver/visits");
    const visit = page.getByRole("region", { name: "Timeline" }).getByRole("listitem").filter({ hasText: "Robin Live" }).last();
    await expect(visit).toBeVisible({ timeout: 20_000 });
    await expect(visit).toContainText("Old friend");
  });

  await test.step("12. sign out: caregiver pages and private APIs are closed", async () => {
    await page.goto("/caregiver/settings");
    await page.getByRole("main").getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/caregiver\/login/);
    await page.goto(personUrl);
    await expect(page).toHaveURL(/\/caregiver\/login/);
    for (const path of ["/api/caregiver/people", "/api/caregiver/albums", "/api/caregiver/visits"]) {
      expect((await page.request.get(path)).status(), path).toBe(401);
    }
    // A brand-new device without the PIN sees nothing private.
    const stranger = await request.get("/api/family");
    expect(stranger.status()).toBe(401);
    expect((await request.get("/api/albums")).status()).toBe(401);
  });

  expect(problems, "CSP violations or page errors").toEqual([]);
});
