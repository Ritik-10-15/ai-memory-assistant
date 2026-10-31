# Deployment guide

Memory Assistant can be deployed in three ways. Pick the one you need.

| | **Public demo** | **Sandbox server** | **Private app** |
|---|---|---|---|
| What it is | The homepage and an interactive, simulated demo with fictional people and illustrated albums | The real app; every visitor signs up for their own private, temporary copy with a fictional family | The real patient screen, caregiver workspace, recognition and family photos |
| Who should see it | Anyone | Anyone (recruiters, visitors) | Only the patient's household and caregivers |
| Data | None. No backend, no camera | Each visitor's own sandbox, deleted after 7 days | Real people, faces, memories and photos: private |
| Build | `npm run build:demo`, or `Dockerfile.demo` | `Dockerfile` with `SANDBOX_MODE=1` | `Dockerfile` (Flask + gunicorn + OpenCV) |
| Where | Any static host, or the demo container | One server with HTTPS | One machine you control |

Never put a real household's data on a sandbox server, and never put real
people's photos or details into the public demo.

---

## 1. Prerequisites

| For | You need |
|---|---|
| Public demo (static) | Node.js 20+ to build, then any static web host |
| Public demo or private app with Docker | Docker Desktop (Windows/macOS) or Docker Engine + the Compose plugin (Linux) |
| Private app without Docker (development) | Python 3.12, Node.js 20+, and the two model files (`python scripts/download_models.py`) |

Tested on Windows 11 with Docker Desktop (Linux containers) and in GitHub
Actions on Ubuntu. The production image is Linux (Debian, Python 3.12) and
builds for x86-64 and Arm (the AWS instance is Arm).

---

## 2. Settings

Copy `.env.example` to `.env` and fill it in. `.env` is ignored by git and
Docker, so it never ends up in the repository or an image.

| Variable | Required | What it does |
|---|---|---|
| `CAREGIVER_PASSWORD` | **yes** | Caregiver workspace password. Use a long passphrase. |
| `PATIENT_PIN` | **yes** | Typed once on the patient's device, which then stays signed in. |
| `SECRET_KEY` | **yes** | Signs session cookies. `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `SECURE_COOKIES` | when on HTTPS | `1` makes cookies HTTPS-only and sends HSTS. Leave `0` for `http://localhost`. |
| `TRUST_PROXY` | behind a proxy | `1` only when a reverse proxy (Caddy) sets `X-Forwarded-For`. |
| `ALLOWED_HOSTS` | no | Comma-separated host names the server answers for; others get 400. |
| `LOG_LEVEL` | no | `INFO` (default), `DEBUG`, `WARNING`, `ERROR`. |
| `OPENAI_API_KEY` | no | Summarises voice-memo transcripts. Leave empty to keep raw transcripts. |
| `APP_PORT`, `DEMO_PORT` | no | Local ports for `compose.yaml` (default 8000 and 8080). |

The private app **refuses to start** in its container while the password,
PIN or secret key is missing or still a development default.

The image always uses the browser's camera (`CAMERA_MODE=browser`): the
patient's tablet sends frames to the server. A camera plugged into the
server is only used when running `python app.py` directly.

---

## 3. Public demo

### Static hosting (recommended)

```bash
cd frontend
npm ci
npm run build:demo        # → frontend/dist-demo/
```

Upload the contents of `frontend/dist-demo/` to any static host (GitHub
Pages, Cloudflare Pages, Netlify, an S3 bucket behind CloudFront…). It is
plain HTML, CSS and JavaScript. `404.html` is a copy of `index.html` so any
path shows the homepage. Every host listed provides HTTPS.

Check it locally first:

```bash
npx vite preview -c vite.demo.config.ts --port 4174    # http://localhost:4174
npx playwright test -c playwright.demo.config.ts        # the demo's own browser tests
```

### As a container

```bash
docker build -f Dockerfile.demo -t memory-assistant-demo .
docker run --rm -p 8080:8080 memory-assistant-demo     # http://localhost:8080
```

A ~95 MB Caddy image that serves the static files without root, with
security headers, long caching for hashed assets, `/healthz`, and a 404 for
anything under `/api/`. Put HTTPS in front of it (most container platforms
do this for you).

### Sandbox server ("try it yourself")

The same image as the private app, with `SANDBOX_MODE=1`. Visitors open the
homepage, choose **Create a free sandbox**, pick a username and password (no
email) and confirm how face photos are used. Each gets a private copy under
`DATA_DIR/tenants/<random id>/` with a fictional family (three people,
memories, three weeks of visits, two albums of drawn pictures). They can use
everything, including enrolling their own face to see live recognition. One
visitor never sees another's data or camera.

| Setting | Default | Meaning |
|---|---|---|
| `SANDBOX_MODE` | off | `1` turns the server into a sandbox server. The shared caregiver password and patient PIN are then not used (and not required). |
| `SANDBOX_DAYS` | 7 | Each sandbox is deleted, with all its files, this many days after sign-up. Visitors can delete theirs at once in Settings. |
| `SANDBOX_MAX` | 50 | Live sandboxes at once; sign-up says "the demo is full" beyond that. |

Still required: `SECRET_KEY`, HTTPS (`SECURE_COOKIES=1` behind Caddy), and
`CAMERA_MODE=browser` (the image default). Sign-ups are limited to 5 per
hour per address; sign-ins pause after 5 wrong passwords. Expired sandboxes
are removed at start-up and every 15 minutes. Recognition runs one frame at
a time for all visitors, so a small server suits a handful of visitors using
the camera at once.

Run it locally: add `SANDBOX_MODE=1` to `.env` and `docker compose up -d`;
the homepage at <http://localhost:8000/welcome> shows the sign-up.

---

## 4. Private app on your own computer (Docker Compose)

```bash
cp .env.example .env            # then set CAREGIVER_PASSWORD, PATIENT_PIN, SECRET_KEY
docker compose up -d --build    # first build takes a few minutes
```

- Patient screen: <http://localhost:8000> (enter the PIN once)
- Caregiver workspace: <http://localhost:8000/caregiver>
- Health: <http://localhost:8000/healthz> (alive) and
  <http://localhost:8000/readyz> (database and recognition ready)

The port is bound to `127.0.0.1`: only this computer can open it. Browsers
allow the camera on `http://localhost`. To use a tablet on the same network
you need HTTPS: use the AWS setup below, or put a reverse proxy with a
certificate in front (see `aws/Caddyfile`).

Also run the public demo next to it: `docker compose --profile demo up -d`
(<http://localhost:8080>).

Stop: `docker compose down` (data stays). **`docker compose down -v` deletes
all data.**

---

## 5. Private app on AWS (one server, HTTPS)

`aws/free-tier-ec2.yaml` creates one t4g.small instance that clones this
repository and runs `docker-compose.aws.yml`: the app plus Caddy, which gets
and renews a Let's Encrypt certificate for the instance's public IP address
(no domain needed).

```bash
aws cloudformation create-stack --region us-east-2 \
  --stack-name memory-assistant \
  --template-body file://aws/free-tier-ec2.yaml \
  --capabilities CAPABILITY_IAM \
  --parameters ParameterKey=CaregiverPassword,ParameterValue=<password> \
               ParameterKey=PatientPin,ParameterValue=<pin>
```

Creating cloud resources costs money once any free allowance is used up;
check current EC2 pricing for your region. The first boot builds the image
(~10 minutes); the `AppUrl` output is the site.

### Releasing a new version

On the instance (Session Manager shell, or `aws ssm send-command`):

```bash
cd /opt/memory-assistant
sudo bash aws/deploy.sh origin/main
```

`deploy.sh`:
1. builds an image tagged with the commit;
2. backs up the data to `/var/backups/memory-assistant/` with the new image,
   while the current version keeps serving;
3. starts the new version and waits up to 3 minutes for `/readyz` to report
   it ready **and** running that commit;
4. otherwise starts the version that was running before and exits with an
   error. Data is never deleted.

**The first time** (servers still running a version from before Phase 9, which
has no `/readyz`), release the usual way once:

```bash
cd /opt/memory-assistant && sudo git fetch origin && sudo git checkout -B main origin/main && sudo bash aws/start.sh
```

From then on use `deploy.sh`.

### Rolling back by hand

```bash
cd /opt/memory-assistant
sudo bash aws/deploy.sh <previous-commit>      # e.g. the commit from `git log`
```

Database migrations only ever add tables, columns and indexes, so an older
version runs on a newer database. If data itself must go back, restore the
backup taken before the release (next section).

---

## 6. Data, backups and restore

Everything the private app stores lives in one place, `DATA_DIR` (`/data` in
the container, a Docker volume): the SQLite database, enrolled face photos,
family photos and thumbnails, pending voice-memo uploads, and the embedding
cache (rebuilt automatically). The models and the web app are part of the
image and are never written to.

On start-up the app creates missing tables and runs pending migrations; a
database that already has data is first copied to `memory_v2.db.bak-v<N>`.
Migrations never delete data.

**Back up** (safe while the app runs):

```bash
# Docker Compose (local)
mkdir -p backups
docker compose run --rm -v "$PWD/backups:/backups" app python scripts/backup.py create /backups

# AWS (deploy.sh also does this before every release)
sudo docker compose -f docker-compose.aws.yml run --rm -v /var/backups/memory-assistant:/backups \
  app python scripts/backup.py create /backups
```

Each archive has a manifest with record counts and a checksum for every file.
Copy archives somewhere else as well (another disk, encrypted cloud storage):
a backup on the same machine does not survive losing the machine. They
contain faces and personal details: treat them like the original data.

**Check a backup:** `python scripts/backup.py verify backups/<file>.tar.gz`

**Restore** (stop the app first):

```bash
docker compose stop app
docker compose run --rm -v "$PWD/backups:/backups" app \
  python scripts/backup.py restore /backups/<file>.tar.gz --force
docker compose start app
```

Restore verifies every checksum before touching anything. Without `--force`
it refuses to restore over an existing database; with `--force` the current
data is moved into `DATA_DIR/pre-restore-<time>/`, not deleted.

---

## 7. Local development (no Docker)

```bash
python -m venv venv && venv/bin/pip install -r requirements.txt   # Windows: venv\Scripts\pip
python scripts/download_models.py
python app.py                       # http://127.0.0.1:5000, development server, server webcam
cd frontend && npm ci && npm run dev   # http://localhost:5173 with live reload
```

`python app.py` uses Flask's development server and is for development only.
Deployments use gunicorn (in the image) with **one worker and eight
threads**: recognition state lives in the worker process, so more processes
would each run their own recognition worker.

Tests: see "Testing" in the README.

---

## 8. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Container exits immediately, log says "Set CAREGIVER_PASSWORD, PATIENT_PIN and SECRET_KEY" | A required setting is missing or a default: fill in `.env`. |
| `/readyz` says `"recognition": "unavailable"` | Model files missing or the recognition worker stopped; see `docker compose logs app`. |
| `/readyz` says `"database": "needs migration"` or `"unavailable"` | The data volume is not mounted or not writable; check `volumes:` and disk space. |
| Camera not available on the tablet | The page is not HTTPS (only `localhost` is exempt), or camera permission was denied in the browser. |
| Caregiver is signed out | Sessions end when the browser closes and after 12 hours; sign in again. |
| Port already in use | Set `APP_PORT` / `DEMO_PORT` in `.env`. |
| Logs | `docker compose logs -f app`. Logs rotate at 10 MB × 3 files. They never contain names, faces, transcripts or secrets. |

---

## 9. Security notes and limits

- One shared caregiver password; no per-person accounts or two-factor sign-in.
- HTTPS is required for any address other than `localhost`.
- The app is not a medical device and makes no compliance claims (HIPAA or
  otherwise). Its security was reviewed against OWASP ASVS guidance, but it
  has not had a penetration test.
- Backups and the data volume hold biometric data; restrict who can read them.
