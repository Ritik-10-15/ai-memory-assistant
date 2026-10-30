# Phase 6 — Integration, reliability and QA report

Branch `phase6-integration`, from `main` at `7d1c0a9` (Phases 1–5 merged and
deployed). Every result below was produced by a command that was actually
run; where something was not verified, it says so.

## 1. Architecture (as found)

```
Browser (React + TypeScript SPA, served by Flask)
  ├─ /welcome            public homepage + simulated demo (no backend calls)
  ├─ /, /family, /albums, /memories      patient app (patient PIN)
  └─ /caregiver/*        caregiver app (caregiver password)
        │  JSON over HTTPS (Caddy → gunicorn, 1 process × 8 threads)
Flask: routes.py · api.py · album_api.py · albums_api.py · auth.py
  ├─ /api/frame ──► camera.process_frame (YuNet) ──► frame_q (2) ──► worker thread
  │                                                    recognize (SFace) → _step (identity
  │                                                    state machine) → shared `detection`
  ├─ /api/current-person ◄── polled every 700 ms by the patient screen
  └─ SQLite (WAL, foreign keys enforced, versioned migrations) + DATA_DIR/photos
```

## 2. Feature-completion matrix (Phases 1–5)

| Phase | Feature | Status | Evidence |
|---|---|---|---|
| 1 | Public homepage, design system | Implemented | `site.spec.ts` at 4 widths, axe clean; live journey 1 |
| 2 | Interactive demo | Implemented (simulated by design) | demo test: no backend/camera calls |
| 3 | Patient companion: recognition states, memories, read-aloud, family, memories pages | Implemented | live journeys 2–6; `phase3.test.tsx`; real-model tests |
| 4 | Caregiver platform: people, profiles, enrollment wizard, memories, visits, settings | Implemented | live journeys 7, 8, 11, 12; `phase4.test.tsx` |
| 4 | Play original voice-memo audio | **Missing** (audio not stored; read-aloud instead) | documented limitation |
| 4 | Individual caregiver accounts / roles | **Missing** (one shared password) | documented limitation |
| 5 | Albums, uploads, people links, viewer, prompts, hidden albums | Implemented | live journeys 9–10; `albums.spec.ts`; 26 backend tests |
| 5 | Per-person album sharing | **Missing** (album is shown or hidden) | documented limitation |

## 3. Defects found and fixed

| # | Sev. | Defect | Root cause | Fix | Regression test |
|---|---|---|---|---|---|
| D1 | **P0** | A weak (uncertain) match right after a confident one was reported as **confident** — a 0.34 match for John shown as "high" at 0.58, with John's memories | The 3-frame confidence average mixed scores from different people | Smoothing is per identity | `test_identity_state.py::test_a_weak_match_is_never_confirmed_on_the_previous_persons_scores` |
| D2 | P1 | "This might be John" sent John's relationship, notes and memories to the device | Details were loaded for `medium` as well as `high` | Only a confirmed identity carries private details | `…::test_an_uncertain_match_carries_no_private_details` |
| D3 | P1 | When frames stopped (camera off, tab hidden, stream closed) the last visitor stayed "recognised" indefinitely; their visit never closed | The worker only updated state when a frame arrived | After `FRAME_STALE_S` (3 s) without frames the identity is dropped; visits keep closing | `…::test_the_identity_expires_when_frames_stop_arriving` |
| D4 | P2 | "Unknown" results still carried the previous match's id and name | Identity fields were written for every state | Unknown / idle carry no identity | `…::test_unknown_and_idle_states_carry_no_identity` |
| D5 | P2 | No browser security headers (clickjacking, sniffing, CSP, HSTS) | Never configured | CSP (`script-src 'self'`, `frame-ancestors 'none'`), nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS over HTTPS, `no-store` on private JSON | `test_security_headers.py`; live journeys assert no CSP violations |
| D6 | P2 | Going Back from `/family/B` to `/family/A` showed B's page at A's address until A loaded (same for caregiver profiles and albums) | `useAsync` kept the previous key's data while loading a new key | Data and errors are tagged with the deps they were loaded for | `useAsync.test.ts` |
| D7 | P1 | A caregiver signing in on the patient's tablet stayed signed in for a year; no caregiver session expired on the server | One cookie: the patient PIN sign-in made it permanent | Caregiver sign-in makes the cookie end with the browser; 12-hour server-side limit; sign-out restores the patient PIN | `test_sessions.py` |
| D8 | P2 | Per-person lookups scanned the whole `visits` table (2.3 s for the people list at 100k visits) | No index on `visits.person_id` / `memories.person_id` | Migration 2 adds both indexes (19 ms) | `test_migrations.py::test_per_person_lookups_use_an_index` |
| D9 | P3 | Minor lint findings (unused imports, empty f-strings) | — | Fixed; CI now runs pyflakes-level lint | CI step |

Each defect was reproduced by a failing test before the fix (D1–D4, D6, D7
failed against the old code; D8 was measured).

## 4. Recognition reliability (tested)

With synthetic recognition results (`test_identity_state.py`, real thresholds):
known confirmed after consecutive frames · brief disappearance bridged ·
stranger replacing a known person dropped after the grace frames · switching
between two known people · weak match after a strong one stays uncertain ·
camera stop expires the identity · rapid changes never pair one person's
memory with another's name.

With the **real YuNet/SFace models** (`test_recognition_real.py`, local):
enroll through the API → recognised via `/api/frame` with their own memory →
empty scene bridged then idle → after deletion the same face is rejected.
Frontend side (existing tests): stale responses ignored, previous visitor's
data dropped on the render the visitor changes, audio stops on change.

Thresholds (0.40 / 0.32), sticky and grace frames are unchanged.

## 5. Performance (measured, `scripts/measure_performance.py`)

12 logical CPUs, Windows, OpenCV 4.13, 640×480 frames, throwaway database.

| Measurement | Median | p95 |
|---|---|---|
| YuNet detection, one frame | 20.9 ms | 25.5 ms |
| SFace embedding, one face | 15.8 ms | 18.7 ms |
| recognize(), gallery 1 / 50 / 500 people × 10 samples | 15.7 / 18.7 / 57.9 ms | 17.7 / 23.5 / 63.2 ms |
| Identity step incl. DB lookup (confirmed) | 2.0 ms | 3.0 ms |
| Frame age when recognised, producer ~30 fps | 0.1 ms | 0.2 ms (238/238 frames recognised, none dropped) |
| POST /api/frame | 17.9 ms | 19.9 ms |
| GET /api/current-person | 0.4 ms | 0.6 ms |
| GET /api/caregiver/people (51 people, 2000 visits) | 23.4 ms → indexed (below) | |
| Upload one 1200×900 photo | 37.4 ms | 44.9 ms |
| GET /api/albums/&lt;id&gt; (30 photos) | 2.5 ms | 4.2 ms |

People list vs. visit-table size (50 people), before → after migration 2:
2k visits 15.5 → 0.5 ms · 20k 156 → 1.6 ms · 100k 2278 → 18.8 ms; patient
family list 100k: 1262 → 0.6 ms.

Memory: ~42 MB for the two models; this machine's process baseline (~680 MB)
includes the optional Whisper/PyTorch install, which the cloud image omits.
The frame queue never filled at 30 fps, so no change was made there.

## 6. Test results (this branch)

| Suite | Result |
|---|---|
| `pytest` | 106 passed, 2 skipped (real-model tests; 2/2 pass with a face photo) |
| `npm run typecheck` | clean |
| `npm test` (Vitest) | 167 passed |
| `vite build` | OK |
| Playwright (desktop/tablet/mobile) | 82 passed, 77 skipped (fixed-viewport specs run once) |
| Live journeys (`playwright.live.config.ts`) | 1/1 — all 12 journeys, no CSP violations or page errors |
| Concurrency stress (4 writer threads + worker + API) | 3/3 runs, no locks, no lost writes, integrity ok |

Visual/accessibility: every patient screen and recognition state, every
caregiver page, albums and the homepage at 1440/1024/768/375 — no horizontal
overflow, no axe WCAG 2.2 AA violations, visible focus on every early tab stop.

## 7. Remaining concerns (honest)

- **Not a security audit.** Checks were guided by OWASP ASVS (sessions,
  access control, input validation, headers) but no penetration test was done.
  No HIPAA or other compliance is claimed.
- Single shared caregiver password; no per-user accounts, MFA or audit log.
- `GET /caregiver/logout` changes state through a GET (a cross-site link can
  sign a caregiver out — low impact).
- Real-model tests and live journeys need a photo of a consenting person, so
  they **run locally only**; CI runs everything else.
- Upload rollback: if a database write fails mid-batch, already-written image
  files can remain on disk (no observed case; files are unreachable).
- Accessibility was verified with axe and keyboard checks, not with a screen
  reader by a person.
- Windows-only test warning: a background thread prints an emoji to a cp1252
  console (not in CI / Docker).

## 8. Before deploying this branch

- Migration 2 (indexes) runs on start, after an automatic backup
  (`memory_v2.db.bak-v1`).
- Caregivers will be asked to sign in again once (existing sessions have no
  start time and count as expired).
- Nothing else is required; no new environment variables.
