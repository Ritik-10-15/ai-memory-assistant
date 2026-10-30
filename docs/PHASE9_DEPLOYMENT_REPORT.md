# Phase 9 — Production deployment, Docker and CI/CD

Branch `phase9-deployment`, from `main` at `0dcf1b2` (Phase 8 merged and
deployed). Nothing in this phase was deployed to a public host, published to
a registry, or changed on the live server: everything was built and tested
locally (Docker Desktop on Windows 11, Linux containers) and in CI. The
step-by-step guide is [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).

Phase 7 never had a brief, so there are no Phase 7 findings; the security
baseline is Phase 6 (headers, sessions, access control) plus Phase 8.

## 1. Audit: what already existed

| Area | Found | Gap |
|---|---|---|
| Entry point | `app.py` (`startup()`, Flask dev server) and `wsgi.py` (gunicorn; refuses default credentials) | — |
| Server | gunicorn, 1 worker × 8 threads — required: recognition state, frame queue and worker thread are per process | documented, kept |
| Docker | Multi-stage `Dockerfile` (Node build → python:3.12-slim), models baked in, `.dockerignore` excluding DB, faces, uploads, secrets | ran as **root**; no image health check; no version |
| Hosting | AWS: one t4g.small, `docker-compose.aws.yml` (app + Caddy with Let's Encrypt for the IP), `aws/start.sh`; also a `render.yaml` blueprint | Docker logs not rotated; no versioned images; releases by hand with no health check or rollback |
| Storage | Everything mutable under `DATA_DIR` (`/data` volume): SQLite, `known_faces/`, `photos/`, `uploads/`, embedding cache; migrations back up first | no backup/restore procedure |
| Camera | `CAMERA_MODE=server` (OpenCV device index, local only) or `browser` (frames posted to `/api/frame`; used in Docker) | — |
| Optional AI | Whisper (not in the image), OpenAI summaries (key optional), pyttsx3 (not in the image) — all degrade gracefully | — |
| Public site | `/welcome` homepage + simulated demo (no backend calls), served by the private app | no separate public deployment; no fictional albums; links into the private app |
| Health | `/healthz` → "ok" | no readiness (DB, models, worker) |
| Logging | `print()` with emoji | no levels or format |
| CI | `tests.yml`: backend + frontend (tests, build, Playwright) | default token permissions, unpinned actions, no audits, no Docker build |

## 2. Deployment architecture

```
                 PUBLIC (anyone)                          PRIVATE (household + caregivers)
  ┌────────────────────────────────────┐     ┌──────────────────────────────────────────────┐
  │ Public demo — static files         │     │ Private app — one machine                    │
  │ npm run build:demo → dist-demo/    │     │  Caddy (HTTPS) ──► gunicorn 1×8 ── Flask     │
  │ (homepage, simulated demo,         │     │                    │  recognition worker     │
  │  fictional illustrated albums)     │     │                    ▼                         │
  │ any static host  or Dockerfile.demo│     │  /data volume: SQLite, faces, photos,        │
  │ no backend · no API · no camera    │     │  uploads, embedding cache  ──► backups       │
  └────────────────────────────────────┘     └──────────────────────────────────────────────┘
```

The two never share code paths at runtime: the demo build has its own entry
(`frontend/src/demo-main.tsx`) that imports only the homepage, so the patient
and caregiver code is not in the bundle (checked: no `/api/`, camera or
sign-in code in `dist-demo`). Server-side authorisation in the private app is
unchanged and still enforced on every endpoint (section 10).

## 3. Docker configuration

- **`Dockerfile`** (private app): unchanged build stages; now runs gunicorn
  as an unprivileged user (uid 10001). `docker-entrypoint.sh` starts as root
  only to give `/data` to that user — needed because the live volume was
  created by the root image — then drops privileges with `setpriv`. Records
  `APP_VERSION` (git commit), adds a `HEALTHCHECK`, graceful shutdown
  (`--graceful-timeout 30`), no access log (the patient device posts several
  frames a second). Models: YuNet (MIT) and SFace (Apache-2.0) from the
  OpenCV model zoo, downloaded at build time; both licences allow
  redistribution. Size 657 MB (OpenCV + NumPy + the models); Whisper/PyTorch
  are deliberately left out.
- **`Dockerfile.demo`** + **`demo/Caddyfile`**: static demo on
  `caddy:2.11.6-alpine`, non-root, port 8080, CSP and other headers,
  immutable caching for hashed assets, `/healthz`, 404 for `/api/*`. 94 MB.
- **`.dockerignore`**: also excludes `photos/` and `frontend/dist-demo/`.
- **`compose.yaml`** (new, local private app): binds `127.0.0.1:8000`, named
  volume, `.env`, rotated logs; `--profile demo` adds the demo on 8080.
- **`docker-compose.aws.yml`**: one image tag per commit
  (`memory-assistant:<sha>`, for rollback), rotated logs (10 MB × 3) for app
  and Caddy. **`aws/Caddyfile`**: no `Server` header.

## 4. Production server

gunicorn `--workers 1 --threads 8 --timeout 120 --graceful-timeout 30
--worker-tmp-dir /dev/shm`. One process is a requirement, not a tuning
choice: a second process would start a second recognition worker with its
own frame queue and identity state, and the patient screen would flicker
between them. Threads serve concurrent requests; recognition runs on its own
thread. Waitress was not needed: production is Linux, and Windows users run
the same Linux container. `python app.py` (Flask development server) is for
development only and documented as such.

## 5. Configuration

| Environment | How it is configured |
|---|---|
| Development | `python app.py`; development defaults in `config.py` (never accepted by `wsgi.py`) |
| Automated tests | pytest fixtures: temporary DB and folders per test; no network, no models |
| Public demo | build-time only: `npm run build:demo` (`VITE_PUBLIC_DEMO=true`); there is no server setting that turns a private server into the demo, so it cannot be switched on by accident |
| Private deployment | environment variables (`.env` locally, `.env.aws` on AWS, platform secrets elsewhere); `.env.example` documents all of them without values |

Debug is off in every deployment path (gunicorn; `app.run(debug=False)`).
Cookies: `HttpOnly`, `SameSite=Lax`, `Secure` with `SECURE_COOKIES=1` (set
on AWS). CORS: no CORS headers are sent, so browsers allow same-origin
requests only. New: `ALLOWED_HOSTS` (Flask `TRUSTED_HOSTS`) and `LOG_LEVEL`.
Missing required settings stop the container at start (tested).

## 6. Persistent storage

Immutable: code, built frontend and models (in the image). Mutable: only
`DATA_DIR` (the volume). Start-up never overwrites records: it creates
missing tables and runs pending migrations, which only add tables, columns
and indexes, after copying an existing database to `memory_v2.db.bak-v<N>`.

`scripts/backup.py`: consistent online copy of SQLite (its backup API, safe
while the app runs) + faces, photos, uploads, with a manifest of record
counts and per-file SHA-256. Restore verifies everything first, refuses to
replace an existing database without `--force`, and with `--force` moves the
current data aside instead of deleting it. `aws/deploy.sh` takes a backup
before every release.

## 7. Camera and recognition

Unchanged. The cloud image can only use the **browser camera** (the
patient's device posts frames over HTTPS); a server cannot reach a camera on
someone's laptop. Server-camera mode (`python app.py`, OpenCV device index)
remains for a local install with a webcam attached. The public demo never
uses a camera: its recognition is a scripted, clearly labelled simulation
("Simulation / Demo mode"). Unknown-person rejection, uncertain matches and
stale-identity protections are unchanged (their tests pass).

## 8. Frontend production build

Typecheck, unit tests and the production build pass. Assets are
content-hashed and served `public, max-age=31536000, immutable`; `index.html`
is `no-cache`. Every client route is served the app shell by Flask (Phase 5
fixed `/albums`); the demo uses `try_files` / `404.html` for the same. The
API base is relative (same origin), so no URL configuration is needed.

## 9. Health and logging

- `/healthz` — the process serves requests (container health checks).
- `/readyz` — `ready` / `not ready` (503) with `database` (`ok`, `needs
  migration`, `unavailable`), `recognition` (models loaded and worker thread
  alive), `camera` (patient device / server camera available or not),
  optional features on/off, and the build `version`. Public, so it returns
  states only: no paths, counts, names or settings (tested).
- Logging: the standard `logging` module, one format
  (`time level module: message`), `LOG_LEVEL`. Messages carry no names,
  embeddings, transcripts, tokens or exception text that could include
  personal data (Phase 8 already removed the per-frame line naming people).

## 10. Local deployment test results

All on this branch, Docker Desktop 29.8 on Windows 11 (Linux containers):

| Check | Result |
|---|---|
| Private image builds | ✅ 657 MB |
| Demo image builds | ✅ 94 MB |
| Container starts; `/readyz` ready with the right version | ✅ |
| gunicorn runs as uid 10001; `/data` owned by the app user | ✅ |
| Volume created by the old root image is taken over on first start; writes work | ✅ (simulated root-owned DB, faces, photos) |
| Refuses to start with default credentials | ✅ exits with code 3 |
| Unauthenticated requests: caregiver/patient APIs, photos, frames | ✅ 401; pages redirect to sign-in |
| Secrets in public responses (password, PIN, secret key, data path, tracebacks) | ✅ none |
| Records and uploaded photos survive restart and container re-creation | ✅ |
| `deploy.sh`: good release (backup → new version ready) | ✅ 37 s |
| `deploy.sh`: broken release (worker never starts) → automatic rollback | ✅ rolled back to the previous commit in 94 s; data intact |
| Backup → restore into a new, empty volume → app ready, person recognised again | ✅ |
| Demo container: site, `/healthz`, `/api/*` → 404, non-root | ✅ |
| Demo in a browser: no API requests, no camera request, journey, axe WCAG 2.2 AA, desktop and mobile | ✅ 6/6 |
| AWS Caddyfile behind a local Caddy: no `Server` header, app headers kept | ✅ |

The deploy-script tests caught two of its own bugs, both fixed: the rollback
target was taken from git rather than from the running app, and the script
could be rewritten by its own `git checkout` while bash was reading it.

Regression suites:

| Suite | Result |
|---|---|
| pytest | **129 passed**, 2 skipped (real-model tests; **2/2 pass** with a face photo) — 13 new: health 5, backup/restore 4, host check 1, plus Phase 8's |
| ruff (F) · compileall · pip-audit (production requirements) | clean · clean · no known vulnerabilities |
| npm audit, runtime dependencies, high and above | pass |
| TypeScript | clean |
| Vitest | **183 passed** (13 new: redirect check) |
| Production build · demo build | OK · OK (73 KB gzipped, one script) |
| Playwright, mocked backend (desktop/tablet/mobile) | first run 81 passed, **1 failed**, 77 skipped; immediate rerun **82 passed**, 0 failed — an intermittent failure; the summary log did not record which test |
| Playwright, public demo build (desktop, mobile) | **6 passed** |
| Live journeys (real backend, 12 journeys) | passed |
| CI Docker job steps, run locally | all pass |

## 11. Hosting recommendation

| Option | OpenCV / Python | Storage | HTTPS | Camera | Effort | Cost | Privacy |
|---|---|---|---|---|---|---|---|
| **Static host for the public demo** (GitHub Pages, Cloudflare Pages, Netlify) | not needed | none | included | none | lowest | free tiers exist | nothing private to leak |
| **One small VM + Docker Compose + Caddy** (current AWS t4g.small) | full control | EBS volume | Let's Encrypt (IP or domain) | browser camera over HTTPS | moderate | pay per hour once free allowances end | data stays on one server you control |
| Managed container platform (e.g. Render, `render.yaml`) | works | needs a paid persistent disk | included | browser camera | low | paid plan for the disk | provider-hosted volume |
| Docker Compose on a home computer | works | local disk | only `localhost` without extra setup | browser camera on the same machine; server webcam with `python app.py` | low | none | never leaves the house; tablet use needs HTTPS |

**Recommendation:** publish the **public demo as a static site** (simplest,
safest, no server) and keep the **private app on the existing single AWS
instance** with `aws/deploy.sh`, or on a home computer with `compose.yaml`
if the patient's screen is that computer. A managed platform adds cost for
the persistent disk without removing the need to look after backups.
Platform limits: one gunicorn process means one instance — no horizontal
scaling, by design; the t4g.small is burstable (sustained CPU spends credits,
see the Phase 8 report); the IP-address certificate is short-lived and
renewed by Caddy, and the address changes if the instance is stopped.

## 12. Remaining blockers and decisions for you

1. **Publishing the public demo** needs your choice of host and approval
   (e.g. enabling GitHub Pages). Nothing has been published.
2. **Deploying this branch to AWS** — say "deploy it" after merging. The
   first release must use the old procedure (section "Releasing a new
   version" in the guide); `deploy.sh` from then on. On first start the
   container takes ownership of the existing data volume (tested locally on
   a simulated root-owned volume, not on the live one).
3. **Off-server backups**: `deploy.sh` keeps backups on the same instance.
   Copying them elsewhere (S3, another machine) or enabling EBS snapshots
   needs an AWS decision and may cost money.
4. **Development-tool vulnerabilities** (npm audit): Vite 5 dev server
   (high), Vitest 2 UI server and tinypool (critical), esbuild dev server
   (moderate) — none run in production; fixing them needs major upgrades
   (Vite 8, Vitest 5). React Router 6 has an open-redirect issue (moderate,
   runtime) fixed only in v7; the one place the app follows a user-supplied
   path (`?next=` after sign-in) now refuses backslashes and control
   characters (tested). CI fails on runtime findings rated high or above.
5. **No domain name**; `ALLOWED_HOSTS` is not set on AWS because the IP can
   change. With a domain, set it and `SITE_ADDRESS`.
6. Still from Phase 6: one shared caregiver password, no two-factor sign-in,
   no penetration test, no compliance claim.

## 13. Changed files

49 files, +1 891 / −86 lines (`git diff --stat main`).

- modified `.dockerignore`
- added `.env.example`
- modified `.gitattributes`
- added `.github/workflows/release.yml`
- modified `.github/workflows/tests.yml`
- modified `.gitignore`
- modified `Dockerfile`
- added `Dockerfile.demo`
- modified `README.md`
- modified `app.py`
- modified `app_instance.py`
- modified `aws/Caddyfile`
- added `aws/deploy.sh`
- modified `aws/start.sh`
- modified `camera.py`
- added `compose.yaml`
- modified `config.py`
- modified `database.py`
- added `demo/Caddyfile`
- modified `docker-compose.aws.yml`
- added `docker-entrypoint.sh`
- added `docs/DEPLOYMENT_GUIDE.md`
- added `docs/PHASE9_DEPLOYMENT_REPORT.md`
- added `frontend/demo/index.html`
- added `frontend/e2e-demo/public-demo.spec.ts`
- modified `frontend/package-lock.json`
- modified `frontend/package.json`
- added `frontend/playwright.demo.config.ts`
- added `frontend/src/demo-main.tsx`
- modified `frontend/src/features/auth/SignInPage.tsx`
- added `frontend/src/features/auth/safeNext.test.ts`
- modified `frontend/src/features/site/Illustration.tsx`
- modified `frontend/src/features/site/Sections.tsx`
- modified `frontend/src/features/site/SiteNav.tsx`
- modified `frontend/src/features/site/SitePage.tsx`
- added `frontend/src/features/site/demo/DemoAlbums.tsx`
- added `frontend/src/lib/publicDemo.ts`
- modified `frontend/tsconfig.json`
- added `frontend/vite.demo.config.ts`
- modified `migrations.py`
- modified `routes.py`
- added `scripts/backup.py`
- modified `services.py`
- added `tests/test_backup.py`
- added `tests/test_health.py`
- modified `tests/test_security_headers.py`
- modified `vision.py`
- modified `worker.py`
- modified `wsgi.py`

## 14. Deployment and rollback

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md): sections 3 (public demo), 4
(local private app), 5 (AWS: release with `aws/deploy.sh`, automatic and
manual rollback) and 6 (backup and restore).
