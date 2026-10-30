Before: ab-linux-A-r1, ab-linux-A-r2 · After: ab-linux-B-r1, ab-linux-B-r2

**cold**

| Metric | Before | After | Change | % | Before p95 | After p95 | Before range | After range |
|---|---|---|---|---|---|---|---|---|
| import services (optional speech/LLM libraries) (ms) | 501 | 431 | -70.52 | -14% | 691 | 545 | 481–522 | 428–433 |
| import app (all modules, incl. services) (ms) | 659 | 574 | -84.47 | -13% | 891 | 730 | 636–682 | 570–578 |
| load YuNet + SFace models (ms) | 97.00 | 98.04 | +1.04 | +1% | 129 | 113 | 92.41–102 | 93.52–103 |

**memory**

| Metric | Before | After | Change | % | Before p95 | After p95 | Before range | After range |
|---|---|---|---|---|---|---|---|---|
| RSS before models (MB, includes optional libraries) | 80.40 | 80.55 | +0.15 | +0% |  |  | 80.30–80.50 | 80.50–80.60 |
| RSS added by YuNet + SFace (MB) | 64.30 | 64.30 | +0.00 | +0% |  |  | 64.30–64.30 | 64.30–64.30 |

**recognition**

| Metric | Before | After | Change | % | Before p95 | After p95 | Before range | After range |
|---|---|---|---|---|---|---|---|---|
| YuNet detection (ms) | 9.95 | 9.42 | -0.54 | -5% | 14.29 | 13.36 | 9.53–10.38 | 8.92–9.91 |
| JPEG decode (browser frame) (ms) | 0.86 | 0.83 | -0.04 | -4% | 1.13 | 1.01 | 0.86–0.87 | 0.81–0.84 |
| SFace align + embedding (ms) | 9.84 | 9.97 | +0.13 | +1% | 14.55 | 14.96 | 9.84–9.84 | 9.17–10.77 |
| recognize() gallery 1 people x 10 (ms) | 10.58 | 10.17 | -0.41 | -4% | 14.38 | 14.56 | 10.01–11.15 | 9.59–10.75 |
| recognize() gallery 10 people x 10 (ms) | 10.68 | 10.18 | -0.51 | -5% | 14.81 | 15.61 | 10.54–10.83 | 9.63–10.72 |
| recognize() gallery 50 people x 10 (ms) | 11.03 | 10.08 | -0.94 | -9% | 14.52 | 14.85 | 10.63–11.43 | 9.71–10.45 |
| recognize() gallery 200 people x 10 (ms) | 13.10 | 11.07 | -2.02 | -15% | 17.16 | 15.17 | 12.76–13.43 | 10.99–11.16 |
| recognize() gallery 500 people x 10 (ms) | 17.80 | 18.31 | +0.52 | +3% | 22.65 | 23.67 | 17.66–17.94 | 17.19–19.44 |

**pipeline:server-camera 30fps, 30 people**

| Metric | Before | After | Change | % | Before p95 | After p95 | Before range | After range |
|---|---|---|---|---|---|---|---|---|
| frames offered by producer | 1,432 | 1,438 | +5.50 | +0% |  |  | 1,425–1,440 | 1,437–1,439 |
| frames recognised by worker | 1,432 | 1,438 | +5.50 | +0% |  |  | 1,425–1,440 | 1,437–1,439 |
| producer rate (frames/s) | 29.70 | 29.80 | +0.11 | +0% |  |  | 29.56–29.84 | 29.79–29.82 |
| consumer rate (frames/s) | 29.70 | 29.80 | +0.11 | +0% |  |  | 29.56–29.84 | 29.79–29.82 |
| frames never recognised (%) | 0.00 | 0.00 | +0.00 |  |  |  | 0.00–0.00 | 0.00–0.00 |
| frame age when recognition starts (ms) | 0.08 | 0.08 | -0.00 | -2% | 0.28 | 0.23 | 0.08–0.09 | 0.08–0.09 |
| worker time per frame (recognise + state) (ms) | 0.04 | 0.04 | +0.00 | +0% | 24.22 | 15.49 | 0.04–0.05 | 0.04–0.04 |
| worker idle wait per frame (ms) | 31.98 | 32.34 | +0.35 | +1% | 37.88 | 36.20 | 31.93–32.03 | 32.18–32.49 |
| queue depth (sampled every ms) (frames) | 0.00 | 0.00 | +0.00 |  | 0.00 | 0.00 | 0–0 | 0.00–0.00 |
| process CPU (% of one core) | 96.25 | 81.40 | -14.85 | -15% |  |  | 91.20–101 | 76.50–86.30 |
| visitor appears -> state 'high' (ms) | 57.23 | 54.59 | -2.64 | -5% | 70.39 | 67.22 | 56.72–57.73 | 53.58–55.60 |
| visitor leaves -> state no longer 'high' (ms) | 413 | 412 | -1.34 | -0% | 425 | 415 | 412–414 | 411–413 |
| memory RSS after (MB) | 224 | 228 | +4.20 | +2% |  |  | 224–225 | 228–228 |
| log output (bytes) | 17,704 | 0.00 | -17,704.50 | -100% |  |  | 17,589–17,820 | 0–0 |
| log output (lines) | 536 | 0.00 | -536.50 | -100% |  |  | 533–540 | 0–0 |

**pipeline:patient device (browser cadence), 30 people**

| Metric | Before | After | Change | % | Before p95 | After p95 | Before range | After range |
|---|---|---|---|---|---|---|---|---|
| frames offered by producer | 304 | 304 | +0.00 | +0% |  |  | 303–305 | 303–305 |
| frames recognised by worker | 304 | 304 | +0.00 | +0% |  |  | 303–305 | 303–305 |
| producer rate (frames/s) | 6.20 | 6.19 | -0.01 | -0% |  |  | 6.20–6.20 | 6.18–6.19 |
| consumer rate (frames/s) | 6.20 | 6.19 | -0.01 | -0% |  |  | 6.20–6.20 | 6.18–6.19 |
| frames never recognised (%) | 0.00 | 0.00 | +0.00 |  |  |  | 0.00–0.00 | 0.00–0.00 |
| frame age when recognition starts (ms) | 0.47 | 0.49 | +0.02 | +3% | 0.70 | 0.83 | 0.46–0.48 | 0.48–0.49 |
| worker time per frame (recognise + state) (ms) | 0.43 | 0.44 | +0.02 | +4% | 14.32 | 14.82 | 0.40–0.45 | 0.44–0.44 |
| worker idle wait per frame (ms) | 159 | 159 | -0.18 | -0% | 164 | 164 | 159–159 | 159–159 |
| queue depth (sampled every ms) (frames) | 0.00 | 0.00 | +0.00 |  | 0.00 | 0.00 | 0–0 | 0.00–0.00 |
| process CPU (% of one core) | 18.95 | 19.60 | +0.65 | +3% |  |  | 18.50–19.40 | 19.50–19.70 |
| visitor appears -> state 'high' (ms) | 181 | 183 | +2.17 | +1% | 191 | 192 | 181–181 | 183–184 |
| visitor leaves -> state no longer 'high' (ms) | 1,946 | 1,940 | -6.48 | -0% | 1,972 | 1,965 | 1,942–1,950 | 1,936–1,943 |
| end-to-end: appears -> patient poll shows them (ms) | 585 | 491 | -94.22 | -16% | 804 | 767 | 531–639 | 443–539 |
| end-to-end: leaves -> patient poll stops showing them (ms) | 2,350 | 2,247 | -103.47 | -4% | 2,602 | 2,514 | 2,328–2,373 | 2,217–2,277 |
| memory RSS after (MB) | 225 | 229 | +3.80 | +2% |  |  | 225–225 | 228–229 |
| log output (bytes) | 3,762 | 0.00 | -3,762.00 | -100% |  |  | 3,762–3,762 | 0–0 |
| log output (lines) | 114 | 0.00 | -114.00 | -100% |  |  | 114–114 | 0–0 |

**pipeline:overload 30fps, 500 people**

| Metric | Before | After | Change | % | Before p95 | After p95 | Before range | After range |
|---|---|---|---|---|---|---|---|---|
| frames offered by producer | 1,438 | 1,418 | -20.50 | -1% |  |  | 1,436–1,440 | 1,405–1,430 |
| frames recognised by worker | 1,438 | 1,411 | -26.50 | -2% |  |  | 1,435–1,440 | 1,393–1,429 |
| producer rate (frames/s) | 29.81 | 29.38 | -0.43 | -1% |  |  | 29.80–29.83 | 29.11–29.65 |
| consumer rate (frames/s) | 29.80 | 29.24 | -0.56 | -2% |  |  | 29.78–29.83 | 28.86–29.62 |
| frames never recognised (%) | 0.05 | 0.50 | +0.45 | +900% |  |  | 0.00–0.10 | 0.10–0.90 |
| frame age when recognition starts (ms) | 0.08 | 0.08 | +0.00 | +0% | 0.24 | 9.68 | 0.08–0.09 | 0.08–0.09 |
| worker time per frame (recognise + state) (ms) | 0.04 | 0.04 | +0.00 | +5% | 23.51 | 38.26 | 0.04–0.04 | 0.04–0.04 |
| worker idle wait per frame (ms) | 32.37 | 32.42 | +0.04 | +0% | 36.02 | 35.89 | 32.24–32.51 | 32.18–32.66 |
| queue depth (sampled every ms) (frames) | 0.00 | 0.00 | +0.00 |  | 0.00 | 0.50 | 0.00–0.00 | 0–0 |
| process CPU (% of one core) | 85.85 | 109 | +23.45 | +27% |  |  | 82.90–88.80 | 107–111 |
| visitor appears -> state 'high' (ms) | 63.55 | 69.96 | +6.41 | +10% | 76.11 | 86.45 | 62.00–65.10 | 67.32–72.59 |
| visitor leaves -> state no longer 'high' (ms) | 412 | 412 | +0.30 | +0% | 416 | 415 | 412–412 | 411–414 |
| memory RSS after (MB) | 226 | 234 | +8.80 | +4% |  |  | 225–226 | 234–234 |
| log output (bytes) | 17,770 | 0.00 | -17,770.50 | -100% |  |  | 17,721–17,820 | 0–0 |
| log output (lines) | 538 | 0.00 | -538.50 | -100% |  |  | 537–540 | 0–0 |

**pipeline:slow device 30fps (+60 ms per recognition), FIFO queue of 2 (before Phase 8)**

| Metric | Before | After | Change | % | Before p95 | After p95 | Before range | After range |
|---|---|---|---|---|---|---|---|---|
| frames offered by producer | 1,440 | 1,438 | -1.00 | -0% |  |  | 1,439–1,440 | 1,438–1,439 |
| frames recognised by worker | 1,140 | 1,144 | +3.00 | +0% |  |  | 1,139–1,142 | 1,143–1,144 |
| producer rate (frames/s) | 29.80 | 29.82 | +0.02 | +0% |  |  | 29.80–29.81 | 29.81–29.83 |
| consumer rate (frames/s) | 23.62 | 23.70 | +0.08 | +0% |  |  | 23.60–23.64 | 23.69–23.71 |
| frames never recognised (%) | 20.75 | 20.50 | -0.25 | -1% |  |  | 20.70–20.80 | 20.40–20.60 |
| frame age when recognition starts (ms) | 0.10 | 0.11 | +0.01 | +10% | 144 | 141 | 0.09–0.11 | 0.10–0.11 |
| worker time per frame (recognise + state) (ms) | 0.03 | 0.04 | +0.00 | +7% | 77.03 | 75.36 | 0.03–0.03 | 0.04–0.04 |
| worker idle wait per frame (ms) | 33.02 | 33.03 | +0.01 | +0% | 36.73 | 36.80 | 32.91–33.13 | 33.00–33.07 |
| queue depth (sampled every ms) (frames) | 0.00 | 0.00 | +0.00 |  | 2.00 | 2.00 | 0–0 | 0–0 |
| process CPU (% of one core) | 66.25 | 67.00 | +0.75 | +1% |  |  | 65.20–67.30 | 66.90–67.10 |
| visitor appears -> state 'high' (ms) | 160 | 159 | -0.24 | -0% | 182 | 162 | 159–160 | 159–160 |
| visitor leaves -> state no longer 'high' (ms) | 506 | 512 | +6.12 | +1% | 546 | 547 | 497–515 | 512–512 |
| memory RSS after (MB) | 226 | 234 | +8.35 | +4% |  |  | 226–226 | 234–234 |

**api**

| Metric | Before | After | Change | % | Before p95 | After p95 | Before range | After range |
|---|---|---|---|---|---|---|---|---|
| seed: 30 people, 1500 memories, 20000 visits, 360 photos (s) | 0.20 | 0.20 | +0.00 | +0% |  |  | 0.20–0.20 | 0.20–0.20 |
| GET /api/current-person (ms) | 0.18 | 0.19 | +0.01 | +3% | 0.29 | 0.32 | 0.17–0.20 | 0.18–0.20 |
| POST /api/frame (ms) | 17.56 | 17.41 | -0.15 | -1% | 25.65 | 25.46 | 17.43–17.70 | 16.43–18.39 |
| GET /api/status (ms) | 0.21 | 0.22 | +0.01 | +7% | 0.45 | 0.55 | 0.20–0.22 | 0.22–0.23 |
| GET /api/family (ms) | 2.03 | 2.18 | +0.15 | +8% | 3.19 | 3.68 | 1.86–2.19 | 1.97–2.39 |
| GET /api/family/<id> (ms) | 1.57 | 1.43 | -0.14 | -9% | 2.69 | 2.44 | 1.50–1.64 | 1.32–1.55 |
| GET /api/album (Memories page) (ms) | 7.05 | 7.66 | +0.61 | +9% | 8.92 | 10.16 | 6.99–7.11 | 6.68–8.64 |
| GET /api/albums (ms) | 0.62 | 0.56 | -0.05 | -9% | 1.31 | 1.33 | 0.60–0.63 | 0.54–0.59 |
| GET /api/albums/<id> (30 photos) (ms) | 1.14 | 1.01 | -0.12 | -11% | 2.22 | 1.99 | 1.11–1.16 | 0.98–1.05 |
| GET photo thumbnail (ms) | 0.70 | 0.72 | +0.02 | +3% | 1.40 | 1.36 | 0.69–0.71 | 0.71–0.72 |
| GET photo full size (ms) | 0.70 | 0.71 | +0.01 | +2% | 1.35 | 1.60 | 0.69–0.70 | 0.67–0.75 |
| GET /api/caregiver/people (ms) | 3.47 | 3.58 | +0.11 | +3% | 5.34 | 5.44 | 3.28–3.65 | 3.21–3.95 |
| GET /api/caregiver/people/<id> (ms) | 1.18 | 1.20 | +0.01 | +1% | 2.10 | 2.21 | 1.12–1.24 | 1.13–1.26 |
| GET /api/caregiver/memories (ms) | 4.11 | 4.20 | +0.09 | +2% | 5.20 | 5.65 | 3.93–4.29 | 3.82–4.58 |
| GET /api/caregiver/visits (ms) | 7.73 | 1.51 | -6.23 | -81% | 9.34 | 2.66 | 7.06–8.41 | 1.51–1.51 |
| GET /api/caregiver/analytics (ms) | 13.43 | 5.62 | -7.81 | -58% | 18.70 | 8.27 | 12.67–14.20 | 5.15–6.09 |
| GET /api/caregiver/albums (ms) | 0.68 | 0.84 | +0.16 | +23% | 1.39 | 1.55 | 0.68–0.69 | 0.64–1.04 |
| GET /api/caregiver/photos (ms) | 7.03 | 6.83 | -0.19 | -3% | 10.04 | 9.92 | 6.53–7.52 | 6.03–7.64 |
| POST /api/caregiver/memories (ms) | 4.22 | 2.47 | -1.74 | -41% | 5.93 | 3.65 | 3.13–5.31 | 2.39–2.56 |
| PATCH /api/caregiver/albums/<id> (ms) | 1.40 | 1.28 | -0.12 | -9% | 2.45 | 2.06 | 1.36–1.45 | 1.24–1.32 |
| memory RSS after (MB) | 285 | 293 | +8.25 | +3% |  |  | 284–285 | 290–296 |

**sqlite**

| Metric | Before | After | Change | % | Before p95 | After p95 | Before range | After range |
|---|---|---|---|---|---|---|---|---|
| open connection (get_db) (ms) | 0.10 | 0.09 | -0.01 | -6% | 0.15 | 0.14 | 0.10–0.10 | 0.09–0.10 |
| caregiver visits list @ 20000 visits (ms) | 6.02 | 0.33 | -5.69 | -94% | 6.86 | 0.38 | 5.79–6.25 | 0.31–0.36 |
| caregiver memories list @ 20000 visits (ms) | 2.05 | 1.96 | -0.10 | -5% | 2.57 | 2.15 | 2.04–2.07 | 1.87–2.04 |
| analytics: last 30 days @ 20000 visits (ms) | 1.21 | 0.12 | -1.09 | -90% | 1.50 | 0.17 | 1.19–1.23 | 0.12–0.12 |
| analytics: per person @ 20000 visits (ms) | 8.51 | 3.28 | -5.24 | -62% | 10.43 | 3.62 | 8.36–8.66 | 3.16–3.39 |
| people list (counts) @ 20000 visits (ms) | 0.68 | 0.69 | +0.01 | +1% | 0.92 | 0.79 | 0.67–0.70 | 0.66–0.72 |
| recognised person details @ 20000 visits (ms) | 0.00 | 0.00 | -0.00 | -12% | 0.01 | 0.00 | 0.00–0.00 | 0.00–0.00 |
| patient recent visits @ 20000 visits (ms) | 4.42 | 0.03 | -4.39 | -99% | 5.16 | 0.05 | 4.28–4.55 | 0.03–0.03 |
| caregiver visits list @ 100000 visits (ms) | 27.47 | 0.38 | -27.09 | -99% | 31.08 | 0.53 | 26.27–28.67 | 0.30–0.46 |
| caregiver memories list @ 100000 visits (ms) | 2.05 | 2.07 | +0.02 | +1% | 2.63 | 2.28 | 2.01–2.10 | 1.96–2.18 |
| analytics: last 30 days @ 100000 visits (ms) | 20.59 | 11.32 | -9.27 | -45% | 23.87 | 13.52 | 19.39–21.79 | 11.13–11.52 |
| analytics: per person @ 100000 visits (ms) | 85.35 | 18.31 | -67.04 | -79% | 104 | 20.66 | 80.13–90.57 | 17.97–18.64 |
| people list (counts) @ 100000 visits (ms) | 6.12 | 5.53 | -0.59 | -10% | 7.26 | 6.48 | 5.33–6.91 | 5.36–5.69 |
| recognised person details @ 100000 visits (ms) | 0.00 | 0.00 | +0.00 | +0% | 0.00 | 0.00 | 0.00–0.00 | 0.00–0.00 |
| patient recent visits @ 100000 visits (ms) | 24.24 | 0.02 | -24.21 | -100% | 28.84 | 0.04 | 23.98–24.49 | 0.02–0.03 |
