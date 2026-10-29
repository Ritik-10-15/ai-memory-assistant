import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the production build (`vite preview`) in Chromium
 * with a fake camera device. The Flask API is mocked per test with
 * page.route(), so recognition states are deterministic.
 * Build first: `npm run build && npm run test:e2e`.
 */
const fakeCamera = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    permissions: ["camera"],
    launchOptions: { args: fakeCamera },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 }, launchOptions: { args: fakeCamera } } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 }, hasTouch: true, launchOptions: { args: fakeCamera } } },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions: { args: fakeCamera } } },
  ],
  webServer: {
    command: "npx vite preview --port 4173 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
