import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

/**
 * Sandbox accounts end to end: the REAL backend in SANDBOX_MODE on a fresh,
 * empty temporary data folder (never existing data), real face models, a
 * real browser. Needs the built frontend, the models and a photo of one
 * consenting person:
 *
 *   npm run build
 *   LIVE_FACE_IMAGE=/path/to/face.jpg LIVE_PYTHON=/abs/path/to/python npx playwright test -c playwright.sandbox.config.ts
 */
const dataDir = mkdtempSync(join(tmpdir(), "memory-assistant-sandbox-"));
const python = process.env.LIVE_PYTHON ?? "python";

export default defineConfig({
  testDir: "./e2e-sandbox",
  timeout: 240_000,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5000", trace: "retain-on-failure", ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
  webServer: {
    command: `"${python}" app.py`,
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    url: "http://127.0.0.1:5000/welcome",
    reuseExistingServer: false, // never attach to a server that may hold real data
    timeout: 120_000,
    env: {
      DATA_DIR: dataDir,
      SANDBOX_MODE: "1",
      CAMERA_MODE: "browser",
      SECRET_KEY: "sandbox-test-key",
      PYTHONUTF8: "1",
    },
  },
});
