# Phase 8 — Performance optimisation and benchmarking

Branch `phase8-performance`, from `main` at `c9bbaad` (Phase 6 merged and
deployed). Every number below comes from a command that was run; where
something was not measured, the report says so. No real patient data, face
embeddings, recordings or secrets were used or are included: all benchmarks
run on throwaway data folders filled with synthetic people, memories, visits
and blank gradient photos, plus one photo of a consenting person that is only
read.

**Prerequisite gap.** The Phase 8 brief lists Phase 7 (security and
accessibility review) as a prerequisite. No Phase 7 brief was received and
there are no Phase 7 findings; the Phase 6 report (security headers, session
limits, axe/WCAG checks) is the most recent security and accessibility
baseline. Nothing in Phase 8 changes authentication, authorisation, headers
or markup semantics, and the Phase 6 security and accessibility tests still
pass (section 9).

## 1. Summary

| | Before | After | Evidence |
|---|---|---|---|
| Visitor shown as "I don't recognise this person" while still in view or stepping away | yes (≈2 s per departure) | no | correctness defect P8-1, regression test |
| Age of the frame being recognised when the worker falls behind (slow device, p95; Windows / Linux) | 166 / 141 ms | 32 / 26 ms | same runs, both buffers |
| Gallery matching, 500 people × 10 photos (Linux 2 CPU / Windows) | 17.8 / 59.4 ms | 18.3 / 15.5 ms (no gain on Linux — section 10) | interleaved A/B |
| Visit history API at 20k visits (Windows) | 18.2 ms | 3.5 ms | interleaved A/B |
| Per-person analytics query at 100k visits (Windows) | 416 ms | 47 ms | interleaved A/B |
| Container log written per hour of camera use (patient device) | ≈0.26 MB, with names | 0 | A/B |
| Local start-up blocked by Whisper (`import app`, Windows) | 3.9 s | 0.8 s | A/B, 3 cold processes each |
| Caregiver JavaScript on first load (gzip) | 133.6 KB | 26.9 KB | production build |
| Patient tablet main-thread work per minute (visitor present) | 4 171 ms (script 1 624) | 3 196 ms (script 877) | browser A/B, one run each |

What was **not** changed, by measurement: OpenCV thread settings (the large
CPU use seen on Windows does not occur in the Linux image), connection
pooling for SQLite (0.09 ms per connection on Linux), the 700 ms recognition
poll and the 150 ms frame gap (section 10).

## 2. Method (reproducible)

### Environment

| | Development machine | Linux container |
|---|---|---|
| CPU | Intel Core i7-1355U (2 performance + 8 efficiency cores, 12 threads) | same host, pinned to 2 logical CPUs (`--cpuset-cpus=0,2`) |
| OS | Windows 11 (10.0.26300), AC power, Balanced plan | Debian 12 (python:3.12-slim), Docker 29.8 / WSL 2 |
| Python / OpenCV / NumPy | 3.12.3 / 4.13.0 (MS Concurrency backend) / 2.4.6 | 3.12 / opencv-python-headless (pthreads backend), from `requirements-cloud.txt` |
| SQLite / Flask | 3.45.1 / 3.1.3 | image defaults |
| Browser | Playwright Chromium 156 (build 1248), Node 24.15 | — |
| Optional speech | Whisper 20250625, PyTorch 2.12.1 (CPU) | not installed (as in production) |

Production is an AWS **t4g.small** (2 Arm Graviton2 vCPUs, burstable,
2 GB). No benchmark was run on the production server; the Linux container is
the closest available stand-in (Linux, the production image, 2 CPUs) but it
is x86, not Arm, and not burstable — see section 10.

### Tools (all in the repository)

- `scripts/benchmark.py` — cold start (fresh processes), recognition
  micro-benchmarks, the real producer–consumer pipeline (real models, real
  queue and worker thread; frame age, queue depth, worker time, CPU, how fast
  the shared identity follows the scene, log volume), every main API endpoint
  through the Flask test client, and SQLite timings with `EXPLAIN QUERY PLAN`
  at 20 000 and 100 000 visits. Writes `docs/benchmarks/<label>.json`.
- `scripts/bench_data.py` / `scripts/seed_benchmark_data.py` — the synthetic
  dataset (30 people, 1 500 memories, 20 000 visits over ~3 years, 12 albums
  of 30 photos, one hidden).
- `scripts/compare_benchmarks.py` — before/after tables; with several runs
  per side, the median of the run medians and the range across runs.
- `frontend/playwright.perf.config.ts` + `e2e-perf/perf.spec.ts` — the real
  backend on the synthetic dataset behind a local gzip proxy
  (`perf/gzip-proxy.mjs`, standing in for production's Caddy `encode gzip`):
  patient-tablet main-thread work and requests per minute, browser
  end-to-end recognition latency, page loads (LCP, CLS, FCP, bytes) and
  interaction latency at desktop and at a 4× CPU slowdown, optional soak.
- `frontend/perf/lighthouse.sh` — Lighthouse 12.8.2 lab runs.
- `scripts/sample_process.ps1` — server memory, threads and handles over time.

### Why interleaved A/B

A first "after" run taken half an hour after the baseline showed code that
had not changed (YuNet detection, JPEG decoding, module imports) running
1.5–3.5× slower: background load on the laptop (browsers, editor) varies more
than most of the effects being measured. That run was discarded. Every
before/after number in this report instead comes from **interleaved runs in
one session — A, B, A, B** — where A is the baseline code (`3fe893c`: the
`main` application code plus the benchmark harness) in a separate git
worktree and B is this branch, both driven by the same harness. Unchanged
code paths act as controls: in the Windows runs YuNet detection, JPEG
decoding and SFace embedding differ by 1–5 % between A and B, so the pairs
are comparable. Each value is the median of the two runs' medians; the
summaries list the range across runs.

Raw results: `docs/benchmarks/ab-windows/`, `docs/benchmarks/ab-linux-2cpu/`,
`docs/benchmarks/frontend-ab/`, `docs/benchmarks/lighthouse-live/`; single baseline runs:
`docs/benchmarks/baseline.json`, `docs/benchmarks/linux-2cpu-baseline.json`.

## 3. Baseline measurements

Single baseline runs on the unchanged code (`docs/benchmarks/baseline.json`,
`docs/benchmarks/linux-2cpu-baseline.json`). Medians, with p95 in brackets;
milliseconds unless stated.

**Recognition, one warm 640×480 frame** (100 runs; `recognize()` 60 runs)

| | Windows | Linux, 2 CPUs |
|---|---|---|
| YuNet detection | 17.4 (19.8) | 7.2 (8.6) |
| SFace align + embedding | 15.8 (19.7) | 7.5 (9.5) |
| `recognize()`, gallery 1 person × 10 | 16.0 (19.7) | 7.9 (11.1) |
| `recognize()`, gallery 50 × 10 | 20.8 (24.8) | 8.5 (11.1) |
| `recognize()`, gallery 500 × 10 | 59.0 (64.6) | 13.7 (15.6) |

**Producer–consumer pipeline** (real models, queue and worker thread; a
known face for 3 s then an empty scene for 5 s, six times per scenario)

| | Server camera 30 fps (Win / Linux) | Patient device, browser cadence (Win / Linux) | 30 fps, 500 people (Win / Linux) |
|---|---|---|---|
| Producer rate (frames/s) | 27.8 / 29.8 | 5.8 / 6.2 | 29.5 / 29.8 |
| Frames never recognised | 0 % / 0 % | 0 % / 0 % | **20.8 %** / 0 % |
| Frame age when recognition starts, p95 | 23.9 / 0.17 | 0.92 / 0.60 | **137.7** / 0.17 |
| Queue depth, p95 (frames) | 1 / 0 | 0 / 0 | 2 / 0 |
| Process CPU (% of one core) | 598 / 73 | 107 / 18 | 590 / 74 |
| Visitor appears → state "high" | 83 / 51 | 213 / 181 | 161 / 56 |
| Visitor leaves → state no longer "high" (sticky frames, by design) | 446 / 411 | 2 080 / 1 941 | 535 / 411 |
| End-to-end: appears → patient poll shows them (p95) | — | 479 (740) / 496 (820) | — |
| Log written per 48 s scenario | 15.0 KB / 17.8 KB | 3.6 KB / 3.8 KB | 8.4 KB / 17.8 KB |

**API** (Flask test client, synthetic family; 100 requests each, 0 failures
in every case)

| Endpoint | Windows (p95) | Linux (p95) | Response size |
|---|---|---|---|
| `GET /api/current-person` | 0.38 (0.46) | 0.16 (0.24) | 0.2 KB |
| `POST /api/frame` (decode + YuNet) | 28.0 (30.8) | 16.0 (22.1) | — |
| `GET /api/family` | 5.8 (7.3) | 2.0 (3.2) | 12 KB |
| `GET /api/album` (patient Memories page) | 15.2 (17.9) | 6.4 (7.2) | **221 KB** |
| `GET /api/albums/<id>` (30 photos) | 3.0 (4.1) | 1.0 (1.6) | 15 KB |
| Photo thumbnail | 2.8 (4.4) | 0.6 (0.9) | 6 KB |
| `GET /api/caregiver/people` | 17.0 (21.7) | 3.3 (5.2) | 11 KB |
| `GET /api/caregiver/visits` | 17.7 (23.0) | 7.1 (8.6) | 43 KB |
| `GET /api/caregiver/analytics` | 37.0 (43.1) | 11.8 (14.2) | 5 KB |
| `GET /api/caregiver/photos` | 12.5 (14.8) | 6.2 (7.8) | **204 KB** |
| `POST /api/caregiver/memories` | 22.9 (26.7) | 2.5 (3.4) | — |

**SQLite** (30 runs each; plans from `EXPLAIN QUERY PLAN`)

| Query | 20k visits (Win / Linux) | 100k visits (Win / Linux) | Plan at 100k |
|---|---|---|---|
| Caregiver visit history (200 newest) | 13.0 / 6.0 | 71.2 / 27.5 | scan + `TEMP B-TREE FOR ORDER BY` |
| Patient recent visits (15 newest) | 9.4 / 4.4 | 63.8 / 24.2 | scan + temp B-tree |
| Analytics, visits per day (30 days) | 2.4 / 1.2 | 65.7 / 20.6 | covering scan of the person index |
| Analytics, per person | 22.3 / 8.5 | 402.9 / 85.4 | per-person index, then table rows |
| Loved-ones counts | 1.3 / — | 28.5 / 5.1 | covering index per person |
| Opening a connection | 0.83 / 0.09 | | |

**Cold start** (3 fresh processes): `import app` 2.9 s median, 4.1 s max on
Windows with Whisper installed (one earlier cold-disk run: 11.9 s); 0.46 s
on Linux, where Whisper is not installed. Loading YuNet + SFace: 73 ms /
108 ms. **Memory:** the models add 42 MB (Windows) / 64 MB (Linux); the
Linux process runs at ≈225 MB during recognition, the Windows one at
≈810 MB, most of it PyTorch and Whisper.

## 4. Bottlenecks and defects identified

| # | Priority | Finding | Evidence |
|---|---|---|---|
| P8-1 | **P0/P1** (incorrect identity display) | While a recognised visitor blinked, turned away or stepped out of view, the patient screen said **"I don't recognise this person"** for about two seconds. `worker.py` imported `vision._name_map` once; `load_known_faces()` replaces that dict on every reload, so the worker kept the empty start-up map and frames bridged by the sticky identity carried a person id and private details but **no name**; the screen treats a confirmed state without a name as unknown. Not a performance issue — found while tracing the identity pipeline. | Reproduced with the real models and a real gallery load; regression test fails on the old code |
| P8-2 | P0 (recognition freshness) | When the worker falls behind, the FIFO queue of two refused the **newest** frame and the worker recognised frames up to ~175 ms old (p95). | Slow-device and overload scenarios |
| P8-3 | P1 | Gallery matching called OpenCV once per enrolled embedding from Python and copied the gallery for every frame: cost grows with the gallery (Windows: 16 ms at 1 person → 59 ms at 500). | Recognition section |
| P8-4 | P2 (long-running stability, privacy) | One log line per recognised frame, including the person's name: ≈3.5 KB per 48 s at the patient device's frame rate, ≈17.7 KB per 48 s with a 30 fps server camera. Docker's default `json-file` log driver does not rotate. | `log output (bytes)` |
| P8-5 | P2 | Visit history and the patient's recent visits sorted the whole `visits` table on every request; per-person analytics read every visit row. | `EXPLAIN QUERY PLAN`: `USE TEMP B-TREE FOR ORDER BY` |
| P8-6 | P2 | Every caregiver page downloaded the charting library (recharts), used only by Visit history. | Build output |
| P8-7 | P2 | The patient screen re-rendered in full for every `/api/frame` reply (~6 a second) and every recognition poll, even when nothing shown changed. | Render-count test; browser main-thread time |
| P8-8 | P3 | Whisper and its model loaded at import time, blocking local start-up by seconds whether or not voice memos are used. | Cold-start section |
| — | not a bottleneck in production | OpenCV CPU use on Windows (≈6 cores at 30 fps; ≈1.3 cores on the tablet cadence) comes from its Windows thread pool on 12 threads; the Linux image uses 18 % of one core at the tablet cadence. | Linux vs Windows runs |
| — | not a bottleneck | `/api/current-person` 0.4 ms; photo endpoints 2–3 ms; a SQLite connection 0.09 ms on Linux (0.7–0.9 ms on Windows). | API / SQLite sections |

## 5. Optimisations implemented

Each is a separate commit with its own tests.

1. **Visitor name on bridged frames (P8-1, `a73c775`).** The worker reads the
   name through `vision.display_name()` at call time. Test:
   `test_identity_state.py::test_a_bridged_frame_keeps_the_name_after_a_gallery_reload`
   (fails on the old code). The fixture now installs names the way
   `load_known_faces()` does, so the existing state-machine tests exercise
   the real path.
2. **One matrix product per frame (P8-3, `e370679`).** The gallery is kept
   as an L2-normalised matrix, rebuilt only when `load_known_faces()`
   replaces the gallery; a frame is scored with a single product. Same cosine
   similarity, same first-best tie rule, same thresholds (0.40 / 0.32) and
   open-set rejection. Tests check agreement with the per-embedding loop
   (to 1e-5) on both sides of the threshold and that a reloaded gallery is
   used for the next frame.
3. **No per-frame log line (P8-4, `990b56a`).** Recognition errors are still
   logged. Test: recognising frames writes nothing.
4. **Newest frame only (P8-2, `1184842`).** `worker.LatestFrames` replaces a
   frame still waiting instead of refusing the new one; capacity is one
   frame. Tests cover eviction order, eight concurrent producers (gunicorn
   threads) and a waiting worker waking up. Smoothing, sticky frames,
   grace frames and the stale-frame timeout are unchanged.
5. **Migration 3: visit indexes (P8-5, `3ee3d5c`).** `visits(started_at)`,
   and the per-person index extended to `(person_id, started_at,
   duration_s)` so analytics reads only the index. `ANALYZE` was measured
   too and adds little once the indexes exist, so it is not used (plans stay
   deterministic). Tests assert the query plans. The migration runs at start
   after the usual automatic backup; rollback restores the migration-2 index.
6. **Whisper in the background (P8-8, `1a563b4`).** Start-up no longer waits
   for Whisper; a transcription waits for the model; if loading fails, voice
   memos are refused (503) as before. `routes.py` reads the flag at request
   time (it had imported the value at start-up). Tests: availability is read
   per request; a memo is handed to the background transcriber.
7. **Patient screen renders (P8-7, `51a1ae6`).** Face boxes go to a small
   store that only the camera overlay subscribes to; a poll that differs only
   in `confidence` (never displayed) does not update state. Tests count
   renders: ten face boxes → the screen renders once, the overlay eleven
   times; six polls with two visible changes → three renders.
8. **Visit history on demand (P8-6, `274286a`).** `React.lazy` for that page
   only, with a spinner inside the caregiver layout while it loads.

Also: `photos/` added to `.dockerignore` so family photos uploaded during
local runs can never be copied into a locally built image.

## 6. Before and after

### Windows (development machine), interleaved A/B, 2 rounds

Two rounds per side; each value is the median of the two run medians, range
across runs in the full table (`docs/benchmarks/ab-windows-summary.md`).
Milliseconds unless stated.

| Metric | Before | After | Change |
|---|---|---|---|
| *Control:* YuNet detection (unchanged code) | 16.8 | 16.6 | −1 % |
| *Control:* SFace embedding (unchanged code) | 15.2 | 14.5 | −5 % |
| `recognize()`, 1 person × 10 | 16.2 | 15.1 | −7 % (noise) |
| `recognize()`, 50 × 10 | 20.1 | 14.7 | −27 % |
| `recognize()`, 200 × 10 | 33.5 | 15.6 | −54 % |
| `recognize()`, 500 × 10 | 59.4 | 15.5 | −74 % |
| 30 fps, 500 people: frames never recognised | 19.9 % | 0 % | — |
| 30 fps, 500 people: frame age p95 | 131 | 0.18 | −100 % |
| 30 fps, 500 people: visitor appears → "high" | 172 | 75 | −57 % |
| 30 fps, 500 people: visitor leaves → state changes | 521 | 427 | −18 % |
| Patient device: process CPU (% of one core) | 133 | 113 | −15 % |
| Patient device: visitor appears → "high" | 217 | 212 | −2 % (no change) |
| Patient device: end-to-end appears → poll shows them | 661 | 552 | −16 % (within the 0–700 ms poll phase; n = 12) |
| Log written per 48 s (patient device / 30 fps) | 3.5 KB / 17.7 KB | 0 / 0 | −100 % |
| `GET /api/caregiver/visits` | 18.2 | 3.5 | −81 % |
| `GET /api/caregiver/analytics` | 38.4 | 13.1 | −66 % |
| Other API endpoints (17) | — | — | within ±7 % except thumbnail −30 % (noise: unchanged code) |
| Visit history query, 20k / 100k visits | 14.1 / 72.3 | 0.69 / 0.68 | −95 % / −99 % |
| Patient recent visits, 20k / 100k | 11.0 / 66.7 | 0.07 / 0.07 | −99 % / −100 % |
| Analytics per person, 20k / 100k | 23.3 / 416 | 4.5 / 47.4 | −81 % / −89 % |
| Analytics per day, 20k / 100k | 2.4 / 65.7 | 0.20 / 31.8 | −92 % / −52 % |
| Loved-ones counts, 100k | 29.5 | 30.3 | +3 % (no change) |
| `import app` (cold process, Whisper installed) | 3 888 | 839 | −78 % |
| Memory after start-up and during recognition (MB) | 809 | 812 | no change: Whisper still loads, in the background |

### Linux container, 2 CPUs, interleaved A/B, 2 rounds

Same harness and synthetic data inside the production image
(`docs/benchmarks/ab-linux-2cpu-summary.md`).

| Metric | Before | After | Change |
|---|---|---|---|
| *Control:* YuNet detection | 9.95 | 9.42 | −5 % |
| *Control:* SFace embedding | 9.84 | 9.97 | +1 % |
| `recognize()`, 50 × 10 | 11.0 | 10.1 | −9 % |
| `recognize()`, 200 × 10 | 13.1 | 11.1 | −15 % |
| `recognize()`, 500 × 10 | 17.8 | 18.3 | +3 % (no gain) |
| Server camera 30 fps: process CPU (% of one core) | 96 | 81 | −15 % |
| Patient device: process CPU (% of one core) | 19.0 | 19.6 | +3 % (no change) |
| Patient device: visitor appears → "high" | 181 | 183 | no change |
| Patient device: end-to-end appears → poll shows them | 585 | 491 | −16 % (poll phase; n = 12) |
| Log written per 48 s (patient device / 30 fps) | 3.8 KB / 17.7 KB | 0 / 0 | −100 % |
| `GET /api/caregiver/visits` | 7.7 | 1.5 | −81 % |
| `GET /api/caregiver/analytics` | 13.4 | 5.6 | −58 % |
| Visit history query, 20k / 100k visits | 6.0 / 27.5 | 0.33 / 0.38 | −94 % / −99 % |
| Patient recent visits, 20k / 100k | 4.4 / 24.2 | 0.03 / 0.02 | −99 % / −100 % |
| Analytics per person, 20k / 100k | 8.5 / 85.4 | 3.3 / 18.3 | −62 % / −79 % |
| Analytics per day, 20k / 100k | 1.2 / 20.6 | 0.12 / 11.3 | −90 % / −45 % |
| `import app` (Whisper not installed) | 659 | 574 | −13 % |
| Memory during recognition (MB) | 225 | 229 | +2 % |

### Frame buffer under a slow device (same run, same conditions)

Recognition slowed by 60 ms per frame so the worker cannot keep up with a
30 fps producer; both buffers run in the same process one after the other
(medians of runs B-r1 and B-r2 on each platform):

| | Old FIFO of 2 (Win / Linux) | Newest frame only (Win / Linux) |
|---|---|---|
| Frames never recognised | 23.4 % / 20.5 % | 22.8 % / 19.9 % |
| Frame age when recognition starts, p95 | 166 / 141 ms | **32 / 26 ms** |
| Frame age, worst case | 203 / 167 ms | **52 / 57 ms** |
| Visitor appears → "high" | 195 / 159 ms | 196 / 155 ms |
| Visitor leaves → state changes | 575 / 512 ms | **460 / 414 ms** |

The worker still skips frames it cannot keep up with (it must), but it no
longer spends its time on frames that are already out of date.

## 7. CPU and memory

**CPU.** On Linux with 2 CPUs the recognition process uses about **19 % of
one core** at the patient device's frame rate (≈6 frames/s) and 73–96 % at a
30 fps server camera; Phase 8 left the tablet figure unchanged (19.0 →
19.6 %, noise) and lowered the 30 fps figure 96 → 81 %. On Windows the same
work uses 1.1–6.5 cores because of OpenCV's Windows thread pool; the
interleaved runs show 133 → 113 % at the tablet rate. Per-frame cost on
Linux: YuNet ≈9.5 ms, SFace ≈10 ms, decode ≈0.8 ms.

**Memory.** The models add 42 MB (Windows) / 64 MB (Linux). The Linux
process holds ≈225–235 MB during recognition before and after; on Windows
≈810 MB, of which most is PyTorch + Whisper. Loading Whisper in the
background changes when that memory is taken, not how much.

**Long-running stability (server).** 10 minutes of the real server (this
branch) driven by the browser with a visitor arriving and leaving every
20 s, sampled every 30 s (`docs/benchmarks/frontend-ab/soak-server.csv`):

| | Start (after warm-up, 0.5 min) | 10 min |
|---|---|---|
| Private memory | 1 311 MB | 1 307 MB |
| Working set | 807 MB | 505 MB (Windows trimmed it) |
| Threads | 47 | 43 |
| Handles | 806 | 799 (range 793–841, no trend) |

No growth in memory, threads or handles, and the frame buffer never held
more than one frame (pipeline runs). The server used ≈0.8 of a core on
Windows during this run (CPU time 27.8 s → 478 s over 9.5 min).

**Long-running stability (browser): not measured.** The 15-minute browser
soak was cut off by Playwright's 10-minute per-test limit before it saved
its samples (fixed in `perf.spec.ts`, not re-run). Within the 60-second
steady-state windows, JS heap (≈5 MB), DOM nodes (401–454) and event
listeners (194–198) were identical before and after a visitor came and went.
Camera reconnection on real hardware was not tested; all camera input was
a synthetic canvas stream.

## 8. Frontend

Lab measurements only (no real-user data exists). Real backend on the
synthetic dataset, behind the local gzip proxy, Chromium 156, no network
throttling; "mobile" is a 412×915 viewport with a 4× CPU slowdown. **One
interleaved run per side** (A = baseline worktree, B = this branch), so
single-page differences of a few tens of ms are within noise — the homepage,
whose code did not change, moved 816 → 1 708 ms on mobile between the two
runs. Raw: `docs/benchmarks/frontend-ab/`.

**Bundles** (production build, gzip; exact, not timed)

| Chunk | Before | After |
|---|---|---|
| Patient app + shell (`index`) | 80.4 KB | 80.7 KB |
| Caregiver workspace, loaded on every caregiver page | 133.6 KB | **26.9 KB** |
| Visit history + charts, loaded when that page opens | (in the above) | 107.2 KB |
| Public homepage | 17.2 KB | 17.2 KB |

Measured transfer on caregiver Overview / Loved ones (JS, via the gzip
proxy): 210.5 → 106.7 KB.

**Patient tablet, steady state** (60 s windows, fake camera, real
recognition)

| Per minute | Visitor present: before → after | Nobody there: before → after |
|---|---|---|
| Main-thread task time | 4 171 → **3 196 ms** (−23 %) | 3 512 → **2 804 ms** (−20 %) |
| of which script | 1 624 → **877 ms** (−46 %) | 1 594 → **1 002 ms** (−37 %) |
| Style recalculations | 382 → 305 | 386 → 308 |
| Requests: `/api/frame` / `/api/current-person` | 295 / 83 → 301 / 83 | 300 / 83 → 303 / 83 |
| JS heap · DOM nodes · listeners | 5.4 MB · 454 · 198 → 4.8 MB · 454 · 198 | unchanged |

Most of the remaining main-thread time is capturing and JPEG-encoding a
camera frame about five times a second, which is the job.

**Recognition, end to end in the browser** (scene change → patient screen
text, timed inside the page; 8 cycles each)

| | Before | After |
|---|---|---|
| Visitor appears → "This is …" shown (median / max) | 1 006 / 1 035 ms | 1 006 / 1 029 ms |
| Visitor leaves → their name removed (median / max) | 851 / 869 ms | 2 983 / 3 029 ms |

The second row got longer **on purpose**: before, the name vanished early
because of defect P8-1 (bridged frames had no name, so the screen fell back
to "I don't recognise this person"); now the name stays through the
designed bridging period (12 frames ≈ 2 s at the tablet's frame rate) and
then the screen shows that nobody is there.

**Page loads and interactions** (median of 3 cold loads per run; LCP and CLS
from `PerformanceObserver`; "interaction" is the longest Event Timing entry
of one typical interaction, a lab stand-in for INP)

| Page | Desktop LCP | Desktop CLS | Mobile (4× CPU) LCP | Mobile CLS | Interaction (desktop / mobile) |
|---|---|---|---|---|---|
| Homepage | 184 → 192 | 0.103 → 0.103 | 816 → 1 708 (noise) | 0.083 | 16 → 0 / 24 → 80 |
| Patient home, visitor present | 200 → 216 | 0.02 → 0.054 | 756 → 688 | 0 | 16 → 24 / 72 → 56 |
| Patient Family | 104 → 88 | **0.906** → **0.906** | 180 → 176 | 0 | — |
| Patient album, 30 photos | 212 → 204 | 0.903 → 0.115 | 764 → 632 | 0 | 40 → 32 / 96 → 112 |
| Patient Memories | 288 → 420 | **0.673** → **0.670** | 168 → 544 | 0 | — |
| Caregiver Overview | 148 → 152 | 0.003 | 488 → 612 | 0 | 24 → 16 / 64 → 48 |
| Caregiver Loved ones | 140 → 144 | 0.001 → 0 | 476 → 484 | 0 | — |
| Caregiver Visit history | 160 → 176 | 0.012 | 556 → 1 140 | 0 | — |

Against Google's thresholds: every LCP is under 2.5 s and every measured
interaction under 200 ms in this lab setup. **CLS fails on desktop** for the
patient Family (0.91), Memories (0.67) and album (0.12–0.90) pages and is at
the limit on the homepage (0.10); it is 0 on the same pages at mobile width.
This is not caused by Phase 8 (same before and after) and was not fixed here
— see section 10.

**Lighthouse 12.8.2, live public homepage** (https://18.226.170.110/welcome,
production, Lighthouse's simulated throttling; mobile = median of 3 runs)

| | Performance | Accessibility | LCP | FCP | TBT | CLS | Bytes |
|---|---|---|---|---|---|---|---|
| Mobile | 96 | 100 | 2.07 s | 1.98 s | 0 ms | 0.076 | 240 KB |
| Desktop | 98 | 100 | 0.48 s | 0.43 s | 6 ms | 0.091 | 240 KB |

Signed-in pages were not run through Lighthouse (they need a session on a
server with synthetic data; `perf/lighthouse.sh` supports it).

## 9. Regression and safety testing

All on the final code of this branch:

| Suite | Result |
|---|---|
| `pytest tests/` | **119 passed**, 2 skipped (the real-model tests) |
| Real models (`MEMORY_ASSISTANT_FACE_IMAGE=… pytest tests/test_recognition_real.py`) | 2 passed |
| `ruff check --select F`, `compileall` | clean |
| TypeScript (`tsc`) | clean |
| Vitest | **170 passed** (167 before + 3 render-count tests) |
| Production build | OK |
| Playwright, mocked backend, desktop / tablet / mobile | **82 passed**, 77 skipped (fixed-viewport specs run once) — includes axe WCAG 2.2 AA and no-horizontal-scroll checks at 1440/1024/768/375 |
| Live journeys (real backend, 12 journeys) | passed 3 of 4 runs; the other run ended when the Playwright **runner process** crashed (exit 0xC0000409) before reporting — not an app or page error; not seen again |

Behaviour covered by these tests and re-checked: known-person recognition,
unknown-person rejection, uncertain matches without private details,
known→unknown and person-to-person transitions, stale identity after frames
stop, audio stopping when the visitor changes, caregiver sign-in and the
12-hour limit, patients never seeing photos from hidden albums, database
migrations and rollback (including migration 3), concurrent writers, and
the public demo making no backend calls. New tests: 1 identity, 2 matcher
equivalence, 1 logging, 5 frame buffer, 1 query plan, 3 voice memo,
3 render count.

## 10. Remaining bottlenecks and limitations

- **Not measured on production hardware.** The t4g.small is Arm (Graviton2)
  and burstable; the Linux numbers come from 2 x86 cores on a laptop.
  Absolute times on the server will differ, and sustained CPU use there
  spends CPU credits. Nothing was run on the live server.
- **Matrix matching gave no gain on Linux at 500 people** (17.8 → 18.3 ms),
  only −9 % to −15 % at 50–200 people, versus −74 % on Windows. Not yet
  investigated; a likely cause is NumPy's BLAS threads competing with
  OpenCV's threads on 2 CPUs. `scripts/matching_experiment.py` compares the
  options (per-embedding loop, `@`, `einsum` without BLAS) and was added for
  that follow-up; it was not run. A family-sized gallery (tens of people) is
  unaffected either way (≈10 ms per frame on Linux).
- **Layout shift (CLS) on desktop** for the patient Family (0.91), Memories
  (0.67) and album pages, and 0.10 on the homepage: content (photos, cards)
  arrives after the first paint and pushes the page. Pre-existing; not
  changed in Phase 8. Likely fix: reserve space for loading lists and
  images (fixed aspect boxes / skeletons with the final size).
- **Unpaginated patient Memories and caregiver Photos payloads:**
  `GET /api/album` returns every memory card (up to 200) and every visible
  photo: 221 KB of JSON for 360 photos; `GET /api/caregiver/photos` 204 KB.
  Fine at this size, grows linearly with the photo library.
- **Analytics per day at 100k visits** still scans the visits of the last
  30 days (11–32 ms); with the synthetic data half of all visits fall in
  that window, which is unrealistic.
- **OpenCV on Windows** uses ≈1.1–6 cores for the camera pipeline (its
  Windows thread pool on 12 threads); a thread cap would help local
  `python app.py` use but was not changed because the evidence that
  matters for production (Linux) shows no problem.
- **Recognition latency is dominated by design choices that were kept:**
  three-frame smoothing (a visitor is confirmed after ≈2 frames), the 700 ms
  poll (end-to-end ≈0.5 s in-process, ≈1.0 s in the browser with the fake
  camera) and 12 sticky frames when someone leaves (≈2 s). Shortening any of
  them trades away stability the patient screen relies on; not changed.
- **Whisper/LLM latency not measured.** Whisper start-up was measured (it now
  loads in the background), but transcription of synthetic audio was not run
  for time reasons (`benchmark.py --sections speech` does it); LLM
  summarisation needs an API key and was not measured. Memory with Whisper
  installed is unchanged (≈810 MB once it has loaded).
- **Browser soak not completed** (section 7); 10-minute server soak only, on Windows.
- **Frontend A/B is one run per side**; the large effects (bundle size,
  main-thread script time) are well outside the noise, small LCP
  differences are not.
- **Lighthouse** was run on the public homepage only.

## 11. Recommendations for Phase 9 (deployment)

1. **Turn on Docker log rotation** in `docker-compose.aws.yml`
   (`logging: {driver: json-file, options: {max-size: "10m", max-file: "3"}}`).
   Phase 8 removed the per-frame log line, but nothing bounds the log.
2. **Measure on the real instance before relying on these numbers:** run
   `scripts/benchmark.py` inside the deployed image on the t4g.small (it uses
   a temporary data folder, never `/data`), during a quiet period, and watch
   the CPU-credit balance in CloudWatch while a patient tablet runs for an
   hour. If credits drain, consider t4g.medium or unlimited mode.
3. **Deploying this branch:** migration 3 runs at start-up after the usual
   automatic backup (`memory_v2.db.bak-v2`) and only adds and rebuilds
   indexes; no data changes. No new environment variables. The browser
   caches nothing new (`/assets/` is already immutable-cached).
4. **Fix desktop CLS** on the patient Family, Memories and album pages
   (reserve space for loading content) and re-measure with
   `playwright.perf.config.ts`.
5. **Follow up the Linux matcher result** with
   `scripts/matching_experiment.py`; switch to `einsum` (no BLAS threads) if
   it is faster on the server.
6. **Paginate** `/api/album` and `/api/caregiver/photos` before photo
   libraries reach the low thousands.
7. Keep using **interleaved A/B runs** for any future performance claim; a
   single before/after pair on a laptop is not reliable.
