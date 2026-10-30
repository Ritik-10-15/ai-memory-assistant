import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

/**
 * Phase 8 browser performance measurements: the REAL backend on a fresh
 * temporary data folder filled with the synthetic benchmark dataset
 * (scripts/seed_benchmark_data.py — never real data), behind a local gzip
 * proxy that stands in for production's Caddy compression.
 *
 *   npm run build
 *   LIVE_FACE_IMAGE=/path/to/face.jpg LIVE_PYTHON=../venv/Scripts/python PERF_LABEL=baseline \
 *     npx playwright test -c playwright.perf.config.ts
 *
 * Results: docs/benchmarks/frontend-<PERF_LABEL>.json
 */
const dataDir = mkdtempSync(join(tmpdir(), "memory-assistant-perf-"));
const python = process.env.LIVE_PYTHON ?? "python";
const root = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  testDir: "./e2e-perf",
  timeout: 600_000,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5080", ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
  webServer: [
    {
      command: `"${python}" scripts/seed_benchmark_data.py && "${python}" app.py`,
      cwd: root,
      url: "http://127.0.0.1:5000/welcome",
      reuseExistingServer: false, // never attach to a server that may hold real data
      timeout: 180_000,
      env: {
        DATA_DIR: dataDir,
        BENCH_FACE_IMAGE: process.env.LIVE_FACE_IMAGE ?? "",
        CAMERA_MODE: "browser",
        CAREGIVER_PASSWORD: "perf-pass-1234",
        PATIENT_PIN: "2468",
        SECRET_KEY: "perf-test-key",
        PYTHONUTF8: "1",
      },
    },
    {
      command: "node perf/gzip-proxy.mjs",
      cwd: fileURLToPath(new URL(".", import.meta.url)),
      url: "http://127.0.0.1:5080/welcome",
      reuseExistingServer: false,
    },
  ],
});
