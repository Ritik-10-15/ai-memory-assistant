"""
config.py — all paths and tunable constants in one place.

Nothing in here has side effects (no file I/O, no model loading) so it's
always safe to import from anywhere, including tests.
"""
import os
from pathlib import Path

# DATA_DIR holds everything that must survive a restart (DB, enrolled faces,
# uploads, embedding cache). Defaults to the project folder for local runs;
# in the cloud, point it at a mounted persistent volume (e.g. /data).
DATA_DIR        = Path(os.environ.get("DATA_DIR", "."))
KNOWN_FACES_DIR = DATA_DIR / "known_faces"
UPLOADS_DIR     = DATA_DIR / "uploads"
PHOTOS_DIR      = DATA_DIR / "photos"        # family photos (album)
MODELS_DIR      = Path("models")
DB_PATH         = str(DATA_DIR / "memory_v2.db")
CAREGIVER_PASS  = os.environ.get("CAREGIVER_PASSWORD", "caregiver123")
# When set, the patient screen and its APIs require this PIN once per device.
# Unset (local default) leaves the patient screen open, as before.
PATIENT_PIN     = os.environ.get("PATIENT_PIN")
SECRET_KEY      = os.environ.get("SECRET_KEY", "alzheimer-secret-v3-2024")
# A caregiver sign-in ends when the browser closes, and in any case after
# this many hours (checked on the server).
CAREGIVER_SESSION_HOURS = 12

YUNET_PATH = MODELS_DIR / "face_detection_yunet_2023mar.onnx"
SFACE_PATH = MODELS_DIR / "face_recognition_sface_2021dec.onnx"
GALLERY_CACHE = DATA_DIR / "gallery_cache.npz"

# "server": OpenCV opens a webcam attached to the machine running the app
#           (the original local setup).
# "browser": the viewer's browser captures the webcam and posts frames to
#           /api/frame — required when the app runs on a cloud server.
CAMERA_MODE = os.environ.get("CAMERA_MODE", "server")

# Built React app (frontend/ → `npm run build`), served by Flask.
FRONTEND_DIST = Path(__file__).resolve().parent / "frontend" / "dist"

# Production hardening, switched on by the Docker/AWS deployment.
SECURE_COOKIES = os.environ.get("SECURE_COOKIES") == "1"   # HTTPS-only cookie
TRUST_PROXY    = os.environ.get("TRUST_PROXY") == "1"      # behind Caddy
# Optional: host names this server answers for (comma-separated); requests
# naming any other Host are refused with 400. Empty = no check.
ALLOWED_HOSTS  = [h.strip() for h in os.environ.get("ALLOWED_HOSTS", "").split(",") if h.strip()]

# Recognition thresholds — SFace cosine similarity, official same-person
# threshold is 0.363. Two bands so the UI can say "recognized" vs "might be".
SCORE_HIGH   = 0.40
SCORE_MEDIUM = 0.32

SMOOTH_WINDOW         = 3   # frames of confidence smoothing
NO_FACE_TIMEOUT       = 25
FRAME_QUEUE_SIZE      = 1   # newest frame only: the worker never recognises a stale one
STICKY_FRAMES         = 12  # bridge frames with NO detection (blink/turn)
UNKNOWN_GRACE_FRAMES  = 4   # non-matching frames tolerated before dropping a name
FRAME_STALE_S         = 3.0 # no frames for this long (camera off, tab hidden): forget the identity

CAM_W, CAM_H = 640, 480

# Build identifier shown by /readyz (the Docker image sets the git commit).
APP_VERSION = os.environ.get("APP_VERSION", "dev")