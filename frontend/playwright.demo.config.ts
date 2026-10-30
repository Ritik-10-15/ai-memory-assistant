import { defineConfig, devices } from "@playwright/test";

/**
 * The public portfolio build (`npm run build:demo` → dist-demo/), served as
 * plain static files with no backend at all. Build first:
 *   npm run build:demo && npx playwright test -c playwright.demo.config.ts
 */
export default defineConfig({
  testDir: "./e2e-demo",
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4174", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npx vite preview -c vite.demo.config.ts --port 4174 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: !process.env.CI,
  },
});
