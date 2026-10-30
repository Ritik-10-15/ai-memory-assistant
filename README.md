


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

The interface is designed like a **family photo album**, not a clinical
dashboard: warm paper tones, serif headings, large framed photos, and gentle,
pressure-free language. Photos act as conversation starters, and there are no
right or wrong answers.

- **Patient app** (tablet-first, three places only):
  - **Home: "Who's visiting?"** A greeting, the date and time, and the
    recognised visitor's photo, name, relationship and last visit. The last
    conversation is shown with **Read aloud / Stop**, alongside a daily
    featured memory and quick links to family. Six distinct recognition states
    (recognised, not sure, unknown, nobody there, camera unavailable,
    connection problem); no confidence numbers are ever shown to the patient.
  - **Family:** a photo album of the people in the patient's life. Each person
    has a page with their picture, who they are, when they last visited, and
    their shared memories and photos.
  - **Memories:** album cards (photo, story, date, people) that can be read
    aloud, filtered by person, or viewed one at a time with **Look together**,
    made for a carer and their loved one sharing a tablet.
  - Recognition keeps running on every page. If someone arrives while the
    patient is browsing, a calm banner says who is here instead of switching
    pages.
  - The patient app uses the same **companion** look as the public homepage
    (mint, forest, plum, DM Serif Display and Inter). Colours and fonts are
    themeable CSS variables (`frontend/theme.tokens.cjs`), so the caregiver
    workspace keeps its own look from the same components.
  - For a **confirmed** visitor only, their family photos are fetched from
    `/api/family/<id>`. A late response can't land on the wrong person: the
    previous request is aborted, the response must name the person asked
    for, and the hook returns only data stored for the current visitor.
  - Browsing a loved one's page says plainly that it doesn't mean they are
    here; only the camera decides who is visiting.
- **Caregiver workspace** (`/caregiver`), in the same calm palette as the
  patient companion:
  - **Overview** with real counts, recent activity, system status and who
    still needs face enrollment.
  - **Loved ones** directory with search, enrollment filters and sorting; each
    person has a **profile** (details, enrollment, memories, visits, profile
    picture) with edit and delete (always confirmed).
  - **Face enrollment** as four steps: *Who → Photos → Check → Done*. "Done"
    appears only after the server confirms new usable face samples; no face,
    several faces, unreadable images, failed uploads and server errors each
    get a plain explanation.
  - **Memories**: add, edit the wording, delete (confirmed) and listen to each
    memory read aloud, the way the patient will hear it.
  - **Visit history** with charts (and table alternatives), search, visitor
    and date-range filters (including custom dates) and sorting.
  - **Albums & photos**: named albums with ordering, covers and a hide-from-patient switch; uploads with progress; title, story, date, place, prompt, people and linked memory for each photo (see below).
  - **Settings** that exist: larger text and reduced motion for this device,
    read-only camera/recognition/PIN status, sign out, CSV export.

---

### Public homepage

`/welcome` is a public product page: how it works, what is built today versus
on the roadmap, and an **interactive simulated demo** that walks through
Recognise → Identify → Retrieve memory → Reconnect in five scenarios: a known
visitor, an unknown visitor, no face (the identity is held for a moment, then
cleared), a different visitor (one identity fully replaces the other) and an
uncertain match (memories withheld until confirmed). A tablet-style preview,
step progress, Previous/Next/Restart and a similarity meter on the real
thresholds make the safety behaviour visible.

The demo is a small state machine (`frontend/src/features/site/demo/model.ts`)
and the screen is derived from the current step only, mirroring how the real
patient app derives its view. It uses fictional people and original
illustrations, runs entirely in the browser, never opens the camera, never
calls the backend (enforced by tests), and works even when Flask's recognition
services are unavailable. The page has its own design tokens (mint, forest,
plum, cream; DM Serif Display and Inter) and is code-split.
The patient PIN screen links to it ("What is Memory Assistant?").

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
  Lucide icons, Recharts; Fraunces + Nunito Sans (self-hosted); Vitest + React
  Testing Library + axe-core, Playwright
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

- Public homepage: <http://127.0.0.1:5000/welcome>
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
   more than one face are refused, so the wrong person can't be enrolled. The
   gallery is rebuilt after 10 accepted frames; the wizard then polls the
   person's `embedding_count` and only reports success once it has gone up.
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
album_api.py           Family photos + read-only patient album endpoints
albums_api.py          Photo albums (caregiver management, patient read-only)
migrations.py          Numbered schema migrations (upgrade / rollback)
auth.py                Session gates, constant-time checks, login throttling
frontend/              React + TypeScript app (see below)
tests/                 pytest suite (backend)
scripts/               Model downloader, capture helper, demo-data seeder
aws/, Dockerfile       Deployment (see "Deploying to the cloud")
```

```
frontend/src/
  api/                 Typed client + response types for every endpoint
  components/ui/       Design system: Button, Card, Badge, Alert, fields,
                       Modal/ConfirmDialog, loading/empty/error states, Avatar
  features/patient/    Patient app shell, recognition view model, camera, speech
    album/             Family, person pages, memory album, Look together
  features/caregiver/  Caregiver layout and pages
  features/auth/       Caregiver and patient sign-in
frontend/e2e/          Playwright tests (desktop, tablet, mobile)
```

---

## Family photo albums and reminiscence

Family photos are stored separately from the **biometric** enrollment photos
in `known_faces/`, as files in `DATA_DIR/photos/` (outside any public folder)
with database references. Nothing that existed before was changed or removed.

| Table | Purpose |
|---|---|
| `photos` | caption (title), story, approximate date and place (free text, only if known), category, caregiver-written conversation prompt, size, optional `memory_id` (the conversation it illustrates) |
| `photo_people` | who is in each photo — many-to-many, so one birthday photo can show Alex *and* Sarah |
| `albums` | title, description, chosen cover photo, shown to the patient or hidden |
| `album_photos` | which photos are in which album, in order (a photo can be in several albums) |

**Caregivers** (*Albums & photos*): create, rename and describe albums; hide
an album while putting it together; upload photos with a real progress bar
and a result for every file; tag people, date, place, story, category and an
optional prompt; link a photo to a saved conversation; reorder with
**Move up / Move down** buttons (keyboard-friendly, focus stays on the moved
photo); choose the cover; remove a photo from an album (it stays in *All
photos*) or delete it everywhere; delete an album with or without the photos
that aren't in any other album. Every destructive action asks first.

**Patients** (*Albums*): large album covers, an album page with story cards,
and a full-screen viewer — the whole photo, who is in it and how they're
related, when and where, the story, the conversation it came up in, and a
gentle optional prompt. Big Previous / Next buttons and the arrow keys move
between photos; Escape closes. Nothing plays or moves by itself; Listen reads
the story aloud with the device's voice and moving on stops it.

**Privacy rules**

- Patient endpoints are read-only (`/api/family`, `/api/family/<id>`,
  `/api/album`, `/api/albums`, `/api/albums/<id>`) and sit behind the patient
  PIN. They return names, relationships, descriptions, memory summaries,
  photo stories and visit dates; never transcripts, recognition scores,
  enrollment photos or the titles of hidden albums.
- A photo that is **only in hidden albums** is never shown to the patient:
  not in albums, Memories, a person's page, counts, or the image URL itself
  (404 unless a caregiver is signed in).
- Recognition is unchanged. Only a **confirmed** visitor's photos are offered
  on Home ("Photos with Sarah"); an uncertain or unknown face shows nothing
  person-specific. If the visitor changes, their photo viewer closes and its
  reading stops. Browsing albums by hand never depends on the camera.
- Photos are never sent to an external service.

**Uploads** (caregiver only): JPEG, PNG or WebP, recognised from the file's
contents (the name and browser-supplied type are ignored); at most 15 MB per
file and 20 per request; the image must decode. Accepted photos are
downscaled to 1600 px and re-encoded as JPEG (removing EXIF data such as GPS
location), with a 480 px thumbnail for grids. Stored names are random ids,
so a crafted id can't reach outside the photos folder. Deleting a photo
removes the file, its thumbnail and every reference to it.

**Prompts are invitations, not tests.** A caregiver's own prompt comes first;
otherwise a neutral template that fits what's there ("Would you like to hear
the story behind this photo?", "Would you like to listen to this memory?",
"Shall we explore another family moment?"). The app never asks the patient
to recall a name or a fact, and never invents details.

### Album API

| Method & path | Who | Does |
|---|---|---|
| `GET /api/caregiver/albums` | caregiver | all albums, with cover and photo count |
| `POST /api/caregiver/albums` | caregiver | create `{title, description, visible_to_patient}` |
| `GET / PATCH / DELETE /api/caregiver/albums/<id>` | caregiver | read, edit (title, description, visibility, `cover_photo_id`), delete (`?delete_photos=1` also deletes photos in no other album) |
| `POST /api/caregiver/albums/<id>/photos` | caregiver | multipart upload into the album, or JSON `{photo_ids}` to add library photos |
| `PUT /api/caregiver/albums/<id>/photos/order` | caregiver | `{photo_ids}` in the new order (must list each photo once) |
| `DELETE /api/caregiver/albums/<id>/photos/<photo_id>` | caregiver | take a photo out of the album |
| `GET /api/albums` | patient | albums shown to the patient |
| `GET /api/albums/<id>?limit=&offset=` | patient | one page of an album (default 60, max 200) |
| `GET /api/photos/<id>/image?size=thumb` | patient | the image or its thumbnail |

Errors are JSON `{"error": "..."}` with the usual status codes (400 invalid,
401 signed out, 404 not found or hidden, 413 request too large).

### Database migrations

The schema version is kept in SQLite's `PRAGMA user_version`; `migrations.py`
holds numbered, additive migrations that run automatically on startup.

- **Upgrade**: before migrating a database that already holds data, the app
  writes a full copy next to it (`memory_v2.db.bak-v<from>`). Each migration
  runs in a single transaction, so it applies completely or not at all.
- **Rollback**: stop the app, then either restore that copy or run
  `python scripts/db_migrate.py down 0`, which removes only what migrations
  added (album tables and the new photo columns) and keeps every person,
  visit, memory and photo. Run the matching older code afterwards, since the
  app upgrades again on start.
- `python scripts/db_migrate.py status` shows the current version.
- Foreign keys are now enforced; deletes remove dependent rows first.

### Demo data

For showing the app without real families, load clearly labelled demo
records. Every name ends in "(demo)", the photos are synthetic scenery with no
real faces, and no faces are enrolled:

```bash
python scripts/seed_demo.py            # add
python scripts/seed_demo.py --remove   # remove everything it added
# in Docker: docker compose -f docker-compose.aws.yml exec app python scripts/seed_demo.py
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
- This is a prototype and assistive aid, not a medical device. It has not been
  assessed for HIPAA or any other healthcare compliance regime.
- Albums have no per-person sharing rules: every album shown to the patient
  is visible on the patient device. Use *hidden* for anything not ready.
- "Narration" is the device reading the story aloud; recorded voices aren't
  stored. Dates and places are what the caregiver types — nothing is read
  from photo metadata (GPS is removed on upload for privacy).
- Photos are sorted in each album by hand; there is no automatic face
  tagging of family photos (people are tagged by the caregiver).
- There is a single shared caregiver password (from `CAREGIVER_PASSWORD`);
  there are no individual caregiver accounts, roles or in-app password changes.
- Memories can be edited (summary text only, `PUT /api/caregiver/memories/<id>`;
  the original voice-memo transcript is kept unchanged). Original voice-memo
  **audio** isn't stored or linked to a memory, so "play" reads the memory
  aloud with the device's speech voice instead.

---
## Roadmap

- Scale beyond one machine — cameras as edge clients streaming to a central service, behind a production WSGI server.
- Vector database for the gallery — FAISS for fast nearest-neighbor matching as enrolled people grow.
- PostgreSQL — replace SQLite for concurrent multi-user access.
- Multi-face support — detect and identify several people per frame.
- Keep voice-memo recordings and let caregivers play the original audio.
- Individual caregiver accounts with roles and an audit log of changes.

## License

Add a license of your choice (MIT is a common default for portfolio projects).
