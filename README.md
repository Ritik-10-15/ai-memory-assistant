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

- **Patient screen** (`/`) — live camera, large recognised name + relationship,
  the last conversation as text, and an optional "Read this to me" button.
- **Caregiver panel** (`/caregiver`) — add/edit/delete people, upload or live-
  capture face photos, add and delete memory notes, and view visit analytics.

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

- **Backend:** Python, Flask, SQLite
- **Vision:** OpenCV (YuNet detection + SFace recognition, ONNX models)
- **Voice (optional):** Whisper (speech-to-text) + FFmpeg, pyttsx3 (spoken
  greeting), browser `speechSynthesis` (patient-controlled recall playback)
- **Optional summarisation:** OpenAI API (falls back to raw transcript if no key)

---

## Setup

Requires Python 3.10+ and a webcam.

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
python download_models.py

# 4. Run
python app.py
```

Then open:

- Patient screen: <http://127.0.0.1:5000/>
- Caregiver panel: <http://127.0.0.1:5000/caregiver>

The default caregiver password is `caregiver123` (override with the
`CAREGIVER_PASSWORD` environment variable).

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

Three ways, all through the caregiver panel (`/caregiver` → Add person / Edit):

1. **Upload photos** from a folder.
2. **Live capture** from the webcam on a person's edit page.
3. **`capture_faces.py`** — a standalone script that guides you through ~45 shots
   at varied distance/angle/expression (run with the main app stopped so the
   camera is free).

A handful of clear photos is enough; SFace re-detects and aligns faces inside
each photo automatically.

---

## Project structure

```
app.py                 Main Flask app (recognition engine, routes, DB)
download_models.py     One-time downloader for the ONNX models
capture_faces.py       Standalone webcam enrollment helper
templates/             Patient screen + caregiver panel HTML
known_faces/<id>/      Enrolled face photos, one folder per person
models/                YuNet + SFace ONNX models (downloaded, gitignored)
memory_v2.db           SQLite database (people, visits, memories)
```

---

## How recognition thresholds work

Matching uses cosine similarity (higher = more similar):

| Score        | Meaning                        | Shown as            |
|--------------|--------------------------------|---------------------|
| ≥ 0.40       | Confident match                | Name + spoken greet |
| 0.32 – 0.40  | Possible match                 | "Maybe <name>?"     |
| < 0.32 (face present) | Not anyone enrolled   | "Unknown person"    |

These live at the top of `app.py` (`SCORE_HIGH` / `SCORE_MEDIUM`) and can be
tuned to a specific camera and lighting setup by watching the `[RECOG] score=`
values printed to the console.

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
- Automated tests + CI — unit tests for the recognition state machine and database layer, run via GitHub Actions.
- Modular refactor — split the app into recognition, database, routes, and services modules.
- Multi-face support — detect and identify several people per frame.
- Docker — containerize for reproducible deployment.

## License

Add a license of your choice (MIT is a common default for portfolio projects).