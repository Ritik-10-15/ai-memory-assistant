


# AI Memory Assistant for Neurodegenerative Care

![Tests](https://github.com/Ritik-10-15/ai-memory-assistant/actions/workflows/tests.yml/badge.svg)
A real-time face-recognition memory aid. When someone the patient knows appears
on camera, the app recognises them and shows **who they are, how they're
related, and what was talked about last time** — with the option to have that
recap read aloud. It's designed around a simple principle for this user group:
**a confidently wrong name is worse than no name**, so the system is tuned to
fail safe and to keep the patient in control of what they see and hear.

The app has two sides: a calm, view-only **patient screen**, and a
password-protected **caregiver panel** for enrolling people and managing
memories.

---

## Demo at a glance

- **Patient screen** (`/`) — a calm, high-contrast view: the recognised
  visitor's photo, name and relationship, when they last visited, and the last
  conversation as large text with **Read aloud / Stop**. Six distinct states
  (recognised, not sure, unknown, nobody there, camera unavailable, connection
  problem), with no confidence numbers shown to the patient.
- **Caregiver workspace** (`/caregiver`) — overview with system status, a
  searchable people list with enrollment status, guided face enrollment (camera
  or upload, with a reason for every rejected photo), memories, a visit timeline
  with charts, and settings.

---

## Why this project is interesting (the engineering story)

The recognition engine went through a deliberate migration that's the core of
the project:

**v1–v2 used LBPH** (Local Binary Pattern Histograms, classical OpenCV). It
compares raw pixel-texture patterns, and it hit a wall: recognition was weak and
slow, degraded badly with distance/angle/lighting, and needed heavy smoothing
and "sticky" hacks to stay stable. Worse, with a small enrolled gallery it would
always return its closest label no matter how unlike the input — a real safety
problem for this use case.

**v3 migrated to deep-learning embeddings**, both bundled inside modern OpenCV
(no dlib, no compilation, no heavyweight install):

- **Detection — YuNet** (`cv2.FaceDetectorYN`): a fast DNN detector that finds
  faces at distance and across head turns far better than Haar cascades, and
  returns landmarks used to align each face.
- **Recognition — SFace** (`cv2.FaceRecognizerSF`): maps each face to a 128-d
  identity vector (same family of technique as ArcFace). Matching is by cosine
  similarity, confident from a **single frame**, and a genuinely unknown person
  scores clearly below threshold instead of "kind of close."

**Measured result:** the enrolled person matches at a cosine similarity of
~0.70–0.74, while the same-person threshold is 0.363 — a wide, safe margin.
Recognition is effectively instant (single-frame), versus the multi-second,
several-frame confirmation LBPH needed.

Alongside the model migration, the project handles a set of real edge cases that
matter more here than in a generic face demo:

- **No confident-but-wrong identities.** The recognition state machine
  distinguishes "no face present" from "a face is present but unknown," and a
  short grace window bridges brief occlusion (a blink or glance away) *without*
  ever persisting a name onto a different person who walks into frame.
- **Open-set rejection.** Strangers are surfaced as "Unknown person" rather than
  matched to the nearest enrolled identity.
- **Fast restarts.** Face embeddings are cached to disk per photo, so re-enrolling
  only re-embeds new photos.
- **Patient agency in recall.** The last conversation is always shown as text;
  audio playback is opt-in, can be stopped mid-sentence, and auto-stops if the
  person leaves the frame or a different visitor appears.

---

## Tech stack

- **Frontend:** React 18 + TypeScript, Vite, Tailwind CSS, React Router,
  Lucide icons, Recharts; Vitest + React Testing Library + axe-core, Playwright
- **Backend:** Python, Flask, SQLite (gunicorn + Docker in production)
- **Vision:** OpenCV (YuNet detection + SFace recognition, ONNX models)
- **Voice (optional):** Whisper (speech-to-text) + FFmpeg, pyttsx3 (spoken
  greeting), browser `speechSynthesis` (patient-controlled recall playback)
- **Optional summarisation:** OpenAI API (falls back to raw transcript if no key)

---

## Setup

Requires Python 3.10+, Node.js 20+, and a webcam.

```bash
# 1. Create and activate a virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Download the face detection/recognition models (~38 MB)
python scripts/download_models.py

# 4. Build the web interface (once, and after frontend changes)
cd frontend && npm ci && npm run build && cd ..

# 5. Run
python app.py
```

Then open:

- Patient screen: <http://127.0.0.1:5000/>
- Caregiver panel: <http://127.0.0.1:5000/caregiver>

The default caregiver password is `caregiver123` (override with the
`CAREGIVER_PASSWORD` environment variable).

### Frontend development

For live reloading while working on the interface, run Flask and the Vite dev
server side by side. Vite proxies API calls to Flask, so sessions work as in
production:

```bash
python app.py                     # terminal 1 — backend on :5000
cd frontend && npm run dev        # terminal 2 — UI on http://localhost:5173
```

### Optional: voice memos

Voice memos need Whisper **and** FFmpeg. Install FFmpeg separately:

```bash
# Windows
winget install Gyan.FFmpeg      # then restart the terminal

# macOS
brew install ffmpeg
```

If Whisper or FFmpeg aren't present, the rest of the app runs normally and the
voice feature is simply disabled.

---

## Enrolling a person

Three ways:

1. **Upload photos** when adding or editing a person (`/caregiver/people`).
   Each photo is checked for **exactly one face**; photos with no face or
   several faces are rejected with an explanation, and accepted photos are
   re-encoded (which strips location metadata).
2. **Live capture** under *Face enrollment* (`/caregiver/enroll`). Frames with
   more than one face are refused, so the wrong person can't be enrolled.
3. **`scripts/capture_faces.py`** — a standalone script that guides you through ~45 shots
   at varied distance/angle/expression (run with the main app stopped so the
   camera is free).

A handful of clear photos is enough; SFace re-detects and aligns faces inside
each photo automatically.

---

## Project structure

```
app.py / wsgi.py       Entry points (dev server / gunicorn)
config.py              Paths, thresholds, environment settings
vision.py              YuNet + SFace engine, gallery, visit tracking
worker.py              Recognition worker thread + state machine
camera.py              Server webcam / browser frames → worker queue
routes.py              Patient API, video stream, page routes, legacy forms
api.py                 JSON API for the React app (session, caregiver data)
auth.py                Session gates, constant-time checks, login throttling
frontend/              React + TypeScript app (see below)
tests/                 pytest suite (backend)
scripts/               Model downloader, standalone capture helper
aws/, Dockerfile       Deployment (see "Deploying to the cloud")
```

```
frontend/src/
  api/                 Typed client + response types for every endpoint
  components/ui/       Design system: Button, Card, Badge, Alert, fields,
                       Modal/ConfirmDialog, loading/empty/error states, Avatar
  features/patient/    Patient screen, recognition view model, camera, speech
  features/caregiver/  Caregiver layout and pages
  features/auth/       Caregiver and patient sign-in
frontend/e2e/          Playwright tests (desktop, tablet, mobile)
```

---

## How recognition thresholds work

Matching uses cosine similarity (higher = more similar):

| Score        | Meaning                        | Patient screen shows |
|--------------|--------------------------------|---------------------|
| ≥ 0.40       | Confident match                | Name, photo, relationship, last conversation, Read aloud |
| 0.32 – 0.40  | Possible match                 | "This might be <name>" — no photo, memories or read-aloud |
| < 0.32 (face present) | Not anyone enrolled   | "I don't recognise this person" |

The patient screen renders **only the latest backend state** — nothing from a
previous response carries over — so a name never lingers after the backend
reports someone unknown, someone different, or nobody. Read-aloud stops as
soon as the visitor changes or leaves.

These live in `config.py` (`SCORE_HIGH` / `SCORE_MEDIUM`) and can be
tuned to a specific camera and lighting setup by watching the `[RECOG] score=`
values printed to the console.

---

## Deploying to the cloud (Docker)

Locally, OpenCV reads a webcam plugged into the machine running the app. A
cloud server has no webcam, so the Docker image runs in **browser-camera
mode** (`CAMERA_MODE=browser`): the patient/enrollment pages capture the
webcam with `getUserMedia` and post JPEG frames to `/api/frame`. Detection,
recognition, the state machine and visit logging are unchanged — they run on
the server exactly as before.

```bash
docker build -t memory-assistant .
docker run -p 8000:8000 \
  -e CAREGIVER_PASSWORD=<strong-password> \
  -e PATIENT_PIN=<pin> \
  -e SECRET_KEY=<long-random-string> \
  -v memory-data:/data \
  memory-assistant
```

| Variable             | Purpose                                                    |
|----------------------|------------------------------------------------------------|
| `CAREGIVER_PASSWORD` | Required — the container refuses to start on the default   |
| `PATIENT_PIN`        | Required — entered once per patient device (stays signed in for a year) |
| `SECRET_KEY`         | Required — signs the caregiver session cookie              |
| `DATA_DIR`           | Where the DB, faces and uploads live (`/data` in the image) |
| `CAMERA_MODE`        | `browser` in the image, `server` for local `python app.py`  |
| `OPENAI_API_KEY`     | Optional — memory summarisation                            |

**On Render:** the repo includes a `render.yaml` blueprint. In the Render
dashboard choose **New → Blueprint**, select this repo, and fill in
`CAREGIVER_PASSWORD`, `PATIENT_PIN` (and optionally `OPENAI_API_KEY`) when
prompted. `SECRET_KEY` is generated for you, and a 1 GB disk is mounted at
`/data`. Every push to `main` redeploys.

**On AWS (Free Tier, one EC2 instance):** `aws/free-tier-ec2.yaml` creates a
`t4g.small` that clones this repo and runs `docker-compose.aws.yml` — the app
plus Caddy, which serves HTTPS with a free, auto-renewed Let's Encrypt
certificate for the instance's public IP (no domain needed; HTTPS is what
lets the browser use the camera). Data lives in a Docker volume on the instance's EBS disk.

```bash
aws cloudformation create-stack --region us-east-2 \
  --stack-name memory-assistant-free-demo \
  --template-body file://aws/free-tier-ec2.yaml \
  --capabilities CAPABILITY_IAM \
  --parameters ParameterKey=CaregiverPassword,ParameterValue=<password> \
               ParameterKey=PatientPin,ParameterValue=<pin>
```

The `AppUrl` stack output is the site. First boot builds the image, so allow
~10 minutes after `CREATE_COMPLETE`. To ship new code, open a Session Manager
shell on the instance and run
`cd /opt/memory-assistant && sudo git pull && sudo bash aws/start.sh`.

Notes for any hosting platform:

- **Mount a persistent volume at `/data`.** Without one, every enrolled
  person and memory is wiped on each redeploy/restart.
- **HTTPS is required** for browsers to allow camera access (every major
  platform provides it automatically; `localhost` is also allowed).
- The image runs **one** gunicorn worker on purpose — recognition state is
  in-process memory (see `wsgi.py`).
- Whisper voice memos and server-side spoken greetings are left out of the
  image (PyTorch alone is ~2 GB). Text recall and browser read-aloud work.

---

## Testing

```bash
pytest tests/                       # backend: API, recognition logic, database

cd frontend
npm run typecheck                   # TypeScript, strict mode
npm test                            # Vitest + React Testing Library + axe
npm run build && npm run test:e2e   # Playwright: desktop, tablet, mobile
```

The frontend tests cover every recognition state, switching visitors, clearing
stale identities, outages, read-aloud controls, caregiver sign-in and session
expiry, destructive-action confirmation, enrollment errors, keyboard access,
layouts without horizontal scrolling, and WCAG 2.2 AA scans (including colour
contrast) in a real browser. GitHub Actions runs all of it on every push.

---

## Limitations & honest notes

- Recognition quality depends on enrollment photos matching real conditions
  (distance, lighting). The thresholds are a sensible default, not a universal
  constant.
- The face detection and recognition models are **pretrained** (from the OpenCV
  Zoo). This project's contribution is the recognition **pipeline**: detection→
  embedding→matching, the thresholding and open-set rejection, the recognition
  state machine and its failure-mode handling, and the surrounding memory/recall
  product.
- This is a prototype and assistive aid, not a medical device.

---
## Roadmap

- Scale beyond one machine — cameras as edge clients streaming to a central service, behind a production WSGI server.
- Vector database for the gallery — FAISS for fast nearest-neighbor matching as enrolled people grow.
- PostgreSQL — replace SQLite for concurrent multi-user access.
- Multi-face support — detect and identify several people per frame.

## License

Add a license of your choice (MIT is a common default for portfolio projects).
