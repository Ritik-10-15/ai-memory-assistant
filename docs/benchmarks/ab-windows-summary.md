Before: ab-windows-A-r1, ab-windows-A-r2 · After: ab-windows-B-r1, ab-windows-B-r2

**cold**

| Metric | Before | After | Change | % | Before p95 | After p95 | Before range | After range |
|---|---|---|---|---|---|---|---|---|
| import services (optional speech/LLM libraries) (ms) | 3,406 | 437 | -2,968.55 | -87% | 4,145 | 441 | 2,979–3,832 | 420–454 |
| import app (all modules, incl. services) (ms) | 3,888 | 839 | -3,049.89 | -78% | 4,531 | 858 | 3,277–4,500 | 807–870 |
| load YuNet + SFace models (ms) | 126 | 75.84 | -49.81 | -40% | 154 | 87.77 | 101–151 | 73.93–77.75 |

**memory**

| Metric | Before | After | Change | % | Before p95 | After p95 | Before range | After range |
|---|---|---|---|---|---|---|---|---|
| RSS before models (MB, includes optional libraries) | 677 | 175 | -502.65 | -74% |  |  | 677–677 | 174–175 |
| RSS added by YuNet + SFace (MB) | 41.95 | 43.75 | +1.80 | +4% |  |  | 41.50–42.40 | 43.40–44.10 |

**recognition**

| Metric | Before | After | Change | % | Before p95 | After p95 | Before range | After range |
|---|---|---|---|---|---|---|---|---|
| YuNet detection (ms) | 16.76 | 16.60 | -0.16 | -1% | 18.85 | 32.36 | 16.42–17.09 | 16.50–16.69 |
| JPEG decode (browser frame) (ms) | 1.83 | 1.81 | -0.02 | -1% | 2.41 | 2.11 | 1.80–1.87 | 1.76–1.86 |
| SFace align + embedding (ms) | 15.23 | 14.47 | -0.77 | -5% | 18.20 | 18.36 | 14.82–15.64 | 13.87–15.07 |
| recognize() gallery 1 people x 10 (ms) | 16.23 | 15.12 | -1.12 | -7% | 19.14 | 18.68 | 15.84–16.62 | 14.46–15.77 |
| recognize() gallery 10 people x 10 (ms) | 16.26 | 14.81 | -1.45 | -9% | 20.59 | 18.64 | 16.25–16.27 | 14.57–15.05 |
| recognize() gallery 50 people x 10 (ms) | 20.14 | 14.70 | -5.44 | -27% | 24.14 | 18.25 | 19.64–20.64 | 14.64–14.75 |
| recognize() gallery 200 people x 10 (ms) | 33.51 | 15.57 | -17.94 | -54% | 37.65 | 18.55 | 32.27–34.75 | 15.04–16.10 |
| recognize() gallery 500 people x 10 (ms) | 59.36 | 15.52 | -43.83 | -74% | 66.98 | 19.28 | 58.58–60.13 | 15.39–15.65 |

**pipeline:server-camera 30fps, 30 people**

| Metric | Before | After | Change | % | Before p95 | After p95 | Before range | After range |
|---|---|---|---|---|---|---|---|---|
| frames offered by producer | 1,429 | 1,424 | -4.50 | -0% |  |  | 1,429–1,429 | 1,421–1,428 |
| frames recognised by worker | 1,429 | 1,424 | -4.50 | -0% |  |  | 1,429–1,429 | 1,421–1,428 |
| producer rate (frames/s) | 29.61 | 29.52 | -0.09 | -0% |  |  | 29.60–29.62 | 29.46–29.58 |
| consumer rate (frames/s) | 29.61 | 29.52 | -0.09 | -0% |  |  | 29.60–29.62 | 29.46–29.58 |
| frames never recognised (%) | 0.00 | 0.00 | +0.00 |  |  |  | 0.00–0.00 | 0.00–0.00 |
| frame age when recognition starts (ms) | 0.10 | 0.09 | -0.01 | -11% | 0.21 | 0.18 | 0.10–0.10 | 0.09–0.09 |
| worker time per frame (recognise + state) (ms) | 0.07 | 0.06 | -0.00 | -6% | 25.31 | 21.15 | 0.06–0.07 | 0.06–0.06 |
| worker idle wait per frame (ms) | 29.90 | 30.52 | +0.63 | +2% | 39.97 | 39.34 | 29.16–30.63 | 30.03–31.02 |
| queue depth (sampled every ms) (frames) | 0.00 | 0.00 | +0.00 |  | 0.00 | 0.00 | 0.00–0.00 | 0–0 |
| process CPU (% of one core) | 629 | 617 | -12.10 | -2% |  |  | 604–655 | 559–676 |
| visitor appears -> state 'high' (ms) | 77.09 | 74.80 | -2.28 | -3% | 84.97 | 97.68 | 76.22–77.95 | 71.79–77.81 |
| visitor leaves -> state no longer 'high' (ms) | 428 | 428 | +0.25 | +0% | 435 | 435 | 426–430 | 423–434 |
| memory RSS after (MB) | 809 | 812 | +3.30 | +0% |  |  | 809–809 | 812–812 |
| log output (bytes) | 17,655 | 0.00 | -17,655.00 | -100% |  |  | 17,655–17,655 | 0–0 |
| log output (lines) | 535 | 0.00 | -535.00 | -100% |  |  | 535–535 | 0–0 |

**pipeline:patient device (browser cadence), 30 people**

| Metric | Before | After | Change | % | Before p95 | After p95 | Before range | After range |
|---|---|---|---|---|---|---|---|---|
| frames offered by producer | 279 | 283 | +4.00 | +1% |  |  | 277–281 | 282–284 |
| frames recognised by worker | 279 | 283 | +4.00 | +1% |  |  | 277–281 | 282–284 |
| producer rate (frames/s) | 5.70 | 5.78 | +0.08 | +1% |  |  | 5.69–5.70 | 5.74–5.81 |
| consumer rate (frames/s) | 5.70 | 5.78 | +0.08 | +1% |  |  | 5.69–5.70 | 5.74–5.81 |
| frames never recognised (%) | 0.00 | 0.00 | +0.00 |  |  |  | 0.00–0.00 | 0.00–0.00 |
| frame age when recognition starts (ms) | 0.58 | 0.55 | -0.04 | -6% | 1.13 | 0.96 | 0.58–0.59 | 0.53–0.56 |
| worker time per frame (recognise + state) (ms) | 1.81 | 1.79 | -0.03 | -2% | 25.74 | 21.92 | 1.79–1.83 | 1.71–1.86 |
| worker idle wait per frame (ms) | 169 | 168 | -1.26 | -1% | 184 | 179 | 168–170 | 167–169 |
| queue depth (sampled every ms) (frames) | 0.00 | 0.00 | +0.00 |  | 0.00 | 0.00 | 0–0 | 0.00–0.00 |
| process CPU (% of one core) | 133 | 113 | -19.75 | -15% |  |  | 131–135 | 106–120 |
| visitor appears -> state 'high' (ms) | 217 | 212 | -5.35 | -2% | 236 | 232 | 214–221 | 210–213 |
| visitor leaves -> state no longer 'high' (ms) | 2,124 | 2,106 | -17.97 | -1% | 2,161 | 2,152 | 2,108–2,141 | 2,091–2,122 |
| end-to-end: appears -> patient poll shows them (ms) | 661 | 552 | -108.94 | -16% | 913 | 808 | 589–733 | 500–604 |
| end-to-end: leaves -> patient poll stops showing them (ms) | 2,452 | 2,520 | +67.97 | +3% | 2,702 | 2,795 | 2,320–2,584 | 2,519–2,521 |
| memory RSS after (MB) | 807 | 812 | +4.95 | +1% |  |  | 805–809 | 812–812 |
| log output (bytes) | 3,465 | 0.00 | -3,465.00 | -100% |  |  | 3,399–3,531 | 0–0 |
| log output (lines) | 105 | 0.00 | -105.00 | -100% |  |  | 103–107 | 0–0 |

**pipeline:overload 30fps, 500 people**

| Metric | Before | After | Change | % | Before p95 | After p95 | Before range | After range |
|---|---|---|---|---|---|---|---|---|
| frames offered by producer | 1,428 | 1,425 | -3.50 | -0% |  |  | 1,425–1,432 | 1,421–1,429 |
| frames recognised by worker | 1,144 | 1,425 | +281.00 | +25% |  |  | 1,138–1,150 | 1,421–1,429 |
| producer rate (frames/s) | 29.62 | 29.55 | -0.06 | -0% |  |  | 29.59–29.64 | 29.47–29.64 |
| consumer rate (frames/s) | 23.71 | 29.55 | +5.84 | +25% |  |  | 23.63–23.80 | 29.47–29.64 |
| frames never recognised (%) | 19.90 | 0.00 | -19.90 | -100% |  |  | 19.70–20.10 | 0.00–0.00 |
| frame age when recognition starts (ms) | 0.15 | 0.09 | -0.06 | -39% | 131 | 0.18 | 0.15–0.16 | 0.09–0.10 |
| worker time per frame (recognise + state) (ms) | 0.06 | 0.06 | +0.00 | +3% | 75.51 | 22.34 | 0.06–0.06 | 0.06–0.07 |
| worker idle wait per frame (ms) | 31.73 | 30.06 | -1.67 | -5% | 41.08 | 40.18 | 31.45–32.00 | 29.61–30.51 |
| queue depth (sampled every ms) (frames) | 0.00 | 0.00 | +0.00 |  | 2.00 | 0.00 | 0–0 | 0–0 |
| process CPU (% of one core) | 635 | 637 | +2.55 | +0% |  |  | 622–647 | 610–664 |
| visitor appears -> state 'high' (ms) | 172 | 74.59 | -97.85 | -57% | 192 | 84.08 | 171–174 | 74.03–75.15 |
| visitor leaves -> state no longer 'high' (ms) | 521 | 427 | -94.40 | -18% | 570 | 433 | 513–529 | 425–429 |
| memory RSS after (MB) | 807 | 815 | +8.00 | +1% |  |  | 805–810 | 815–816 |
| log output (bytes) | 8,844 | 0.00 | -8,844.00 | -100% |  |  | 8,679–9,009 | 0–0 |
| log output (lines) | 268 | 0.00 | -268.00 | -100% |  |  | 263–273 | 0–0 |

**pipeline:slow device 30fps (+60 ms per recognition), FIFO queue of 2 (before Phase 8)**

| Metric | Before | After | Change | % | Before p95 | After p95 | Before range | After range |
|---|---|---|---|---|---|---|---|---|
| frames offered by producer | 1,424 | 1,416 | -8.00 | -1% |  |  | 1,421–1,426 | 1,409–1,422 |
| frames recognised by worker | 1,084 | 1,085 | +1.50 | +0% |  |  | 1,081–1,086 | 1,081–1,089 |
| producer rate (frames/s) | 29.50 | 29.37 | -0.13 | -0% |  |  | 29.45–29.55 | 29.23–29.51 |
| consumer rate (frames/s) | 22.46 | 22.51 | +0.05 | +0% |  |  | 22.41–22.51 | 22.42–22.60 |
| frames never recognised (%) | 23.85 | 23.35 | -0.50 | -2% |  |  | 23.80–23.90 | 23.30–23.40 |
| frame age when recognition starts (ms) | 0.14 | 0.12 | -0.02 | -15% | 175 | 166 | 0.14–0.14 | 0.11–0.13 |
| worker time per frame (recognise + state) (ms) | 0.06 | 0.05 | -0.00 | -6% | 92.67 | 90.60 | 0.06–0.06 | 0.05–0.06 |
| worker idle wait per frame (ms) | 32.09 | 31.98 | -0.11 | -0% | 40.26 | 40.91 | 31.78–32.40 | 31.63–32.33 |
| queue depth (sampled every ms) (frames) | 0.00 | 0.00 | +0.00 |  | 2.00 | 2.00 | 0–0 | 0–0 |
| process CPU (% of one core) | 629 | 598 | -30.70 | -5% |  |  | 580–677 | 545–651 |
| visitor appears -> state 'high' (ms) | 204 | 195 | -8.71 | -4% | 211 | 212 | 197–211 | 188–202 |
| visitor leaves -> state no longer 'high' (ms) | 568 | 575 | +7.09 | +1% | 605 | 603 | 564–571 | 568–582 |
| memory RSS after (MB) | 809 | 816 | +6.55 | +1% |  |  | 807–811 | 816–816 |

**api**

| Metric | Before | After | Change | % | Before p95 | After p95 | Before range | After range |
|---|---|---|---|---|---|---|---|---|
| seed: 30 people, 1500 memories, 20000 visits, 360 photos (s) | 0.80 | 0.90 | +0.10 | +12% |  |  | 0.80–0.80 | 0.80–1.00 |
| GET /api/current-person (ms) | 0.40 | 0.42 | +0.02 | +4% | 0.58 | 0.55 | 0.38–0.42 | 0.41–0.43 |
| POST /api/frame (ms) | 30.68 | 30.45 | -0.22 | -1% | 35.02 | 36.43 | 29.76–31.59 | 28.44–32.47 |
| GET /api/status (ms) | 0.47 | 0.48 | +0.00 | +1% | 0.78 | 0.73 | 0.42–0.53 | 0.39–0.56 |
| GET /api/family (ms) | 5.66 | 5.39 | -0.27 | -5% | 7.78 | 7.16 | 5.41–5.91 | 5.12–5.65 |
| GET /api/family/<id> (ms) | 4.28 | 4.36 | +0.07 | +2% | 6.01 | 7.05 | 4.20–4.37 | 3.94–4.77 |
| GET /api/album (Memories page) (ms) | 14.54 | 14.23 | -0.31 | -2% | 17.50 | 17.61 | 14.14–14.93 | 13.63–14.83 |
| GET /api/albums (ms) | 2.00 | 1.94 | -0.07 | -3% | 3.01 | 2.75 | 1.93–2.08 | 1.93–1.95 |
| GET /api/albums/<id> (30 photos) (ms) | 2.91 | 2.88 | -0.04 | -1% | 4.36 | 3.93 | 2.82–3.00 | 2.80–2.95 |
| GET photo thumbnail (ms) | 2.97 | 2.07 | -0.90 | -30% | 4.19 | 3.38 | 2.78–3.15 | 1.41–2.72 |
| GET photo full size (ms) | 2.55 | 2.74 | +0.19 | +7% | 3.48 | 3.82 | 2.50–2.60 | 2.50–2.98 |
| GET /api/caregiver/people (ms) | 17.33 | 17.16 | -0.17 | -1% | 22.17 | 22.78 | 16.96–17.69 | 16.44–17.87 |
| GET /api/caregiver/people/<id> (ms) | 4.77 | 4.84 | +0.07 | +2% | 7.12 | 8.04 | 4.60–4.93 | 4.41–5.27 |
| GET /api/caregiver/memories (ms) | 8.52 | 8.50 | -0.01 | -0% | 10.84 | 11.05 | 8.39–8.64 | 8.32–8.69 |
| GET /api/caregiver/visits (ms) | 18.16 | 3.46 | -14.70 | -81% | 23.14 | 4.72 | 17.45–18.87 | 3.44–3.49 |
| GET /api/caregiver/analytics (ms) | 38.36 | 13.13 | -25.23 | -66% | 43.24 | 17.46 | 37.13–39.58 | 12.26–14.00 |
| GET /api/caregiver/albums (ms) | 2.32 | 2.17 | -0.15 | -7% | 3.31 | 3.80 | 2.17–2.47 | 1.99–2.34 |
| GET /api/caregiver/photos (ms) | 13.31 | 12.99 | -0.32 | -2% | 15.85 | 16.99 | 13.03–13.58 | 12.30–13.68 |
| POST /api/caregiver/memories (ms) | 23.13 | 22.37 | -0.77 | -3% | 26.91 | 26.95 | 22.98–23.29 | 21.76–22.97 |
| PATCH /api/caregiver/albums/<id> (ms) | 3.63 | 3.36 | -0.27 | -7% | 5.22 | 4.86 | 3.60–3.67 | 3.36–3.37 |
| memory RSS after (MB) | 856 | 852 | -4.05 | -0% |  |  | 856–856 | 850–854 |

**sqlite**

| Metric | Before | After | Change | % | Before p95 | After p95 | Before range | After range |
|---|---|---|---|---|---|---|---|---|
| open connection (get_db) (ms) | 0.89 | 0.73 | -0.16 | -18% | 1.52 | 1.25 | 0.68–1.09 | 0.39–1.06 |
| caregiver visits list @ 20000 visits (ms) | 14.07 | 0.69 | -13.38 | -95% | 16.63 | 0.79 | 14.03–14.10 | 0.68–0.69 |
| caregiver memories list @ 20000 visits (ms) | 3.57 | 2.85 | -0.72 | -20% | 4.75 | 3.96 | 3.44–3.69 | 2.19–3.51 |
| analytics: last 30 days @ 20000 visits (ms) | 2.36 | 0.20 | -2.17 | -92% | 3.03 | 0.23 | 2.32–2.40 | 0.14–0.25 |
| analytics: per person @ 20000 visits (ms) | 23.25 | 4.52 | -18.73 | -81% | 27.09 | 5.51 | 22.80–23.70 | 4.45–4.59 |
| people list (counts) @ 20000 visits (ms) | 1.30 | 1.19 | -0.11 | -9% | 1.72 | 1.81 | 1.28–1.32 | 1.03–1.35 |
| recognised person details @ 20000 visits (ms) | 0.01 | 0.01 | +0.00 | +0% | 0.01 | 0.02 | 0.01–0.01 | 0.01–0.01 |
| patient recent visits @ 20000 visits (ms) | 11.04 | 0.07 | -10.98 | -99% | 12.95 | 0.07 | 10.91–11.18 | 0.06–0.07 |
| caregiver visits list @ 100000 visits (ms) | 72.25 | 0.68 | -71.58 | -99% | 77.85 | 0.74 | 72.18–72.33 | 0.66–0.69 |
| caregiver memories list @ 100000 visits (ms) | 3.51 | 3.92 | +0.41 | +12% | 4.32 | 4.60 | 3.42–3.59 | 3.69–4.15 |
| analytics: last 30 days @ 100000 visits (ms) | 65.67 | 31.82 | -33.85 | -52% | 72.55 | 36.46 | 64.33–67.02 | 30.68–32.96 |
| analytics: per person @ 100000 visits (ms) | 416 | 47.38 | -368.52 | -89% | 444 | 57.15 | 403–429 | 44.15–50.62 |
| people list (counts) @ 100000 visits (ms) | 29.47 | 30.32 | +0.85 | +3% | 34.62 | 35.49 | 28.58–30.36 | 29.32–31.32 |
| recognised person details @ 100000 visits (ms) | 0.01 | 0.01 | +0.00 | +27% | 0.01 | 0.01 | 0.01–0.01 | 0.01–0.01 |
| patient recent visits @ 100000 visits (ms) | 66.66 | 0.07 | -66.60 | -100% | 72.92 | 0.10 | 66.27–67.06 | 0.06–0.07 |
