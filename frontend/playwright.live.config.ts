import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

/**
 * Live journeys: the REAL Flask backend, real face models and a real
 * browser — no mocks. Each run starts its own server on a fresh, empty
 * temporary data folder (never existing data), so it can't touch real
 * records. Needs the built frontend, the models and a photo of one person:
 *
 *   npm run build
 *   LIVE_FACE_IMAGE=/path/to/face.jpg LIVE_PYTHON=../venv/bin/python npx playwright test -c playwright.live.config.ts
 */
const dataDir = mkdtempSync(join(tmpdir(), "memory-assistant-live-"));
const python = process.env.LIVE_PYTHON ?? "python";

export default defineConfig({
  testDir: "./e2e-live",
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
      CAMERA_MODE: "browser",
      CAREGIVER_PASSWORD: "live-pass-1234",
      PATIENT_PIN: "2468",
      SECRET_KEY: "live-test-key",
      PYTHONUTF8: "1",
    },
  },
});
