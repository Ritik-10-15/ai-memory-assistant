"""
config.py — all paths and tunable constants in one place.

Nothing in here has side effects (no file I/O, no model loading) so it's
always safe to import from anywhere, including tests.
"""
import os
from contextvars import ContextVar
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

# ── Sandbox accounts (public "try it yourself" deployments) ─────────────
# SANDBOX_MODE=1: visitors sign up for a private, temporary copy of the app
# (its own database, faces and photos under DATA_DIR/tenants/<id>/) instead
# of one household sharing a caregiver password and patient PIN.
SANDBOX_MODE      = os.environ.get("SANDBOX_MODE") == "1"
SANDBOX_DAYS      = int(os.environ.get("SANDBOX_DAYS", "7"))      # deleted after this
SANDBOX_MAX       = int(os.environ.get("SANDBOX_MAX", "50"))      # live sandboxes at once
TENANTS_DIR       = DATA_DIR / "tenants"
ACCOUNTS_DB       = str(DATA_DIR / "accounts.db")

# Which sandbox the current request (or recognition frame) belongs to:
# None in the normal single-household mode. Every data path below is read
# through these functions, so each sandbox only ever sees its own files.
_tenant = ContextVar("tenant", default=None)


def tenant():
    return _tenant.get()


def tenant_root(tenant_id):
    return TENANTS_DIR / tenant_id


def set_tenant(tenant_id):
    """Make tenant_id current; returns a token for reset_tenant()."""
    return _tenant.set(tenant_id)


def reset_tenant(token):
    _tenant.reset(token)


def in_background(fn, *args):
    """Run fn(*args) on a daemon thread in the current sandbox (threads do
    not inherit it on their own)."""
    import contextvars
    import threading
    threading.Thread(target=contextvars.copy_context().run, args=(fn, *args), daemon=True).start()


def _root():
    t = _tenant.get()
    return tenant_root(t) if t else None


def db_path():
    r = _root()
    return str(r / "memory_v2.db") if r else DB_PATH


def known_faces_dir():
    r = _root()
    return r / "known_faces" if r else KNOWN_FACES_DIR


def photos_dir():
    r = _root()
    return r / "photos" if r else PHOTOS_DIR


def uploads_dir():
    r = _root()
    return r / "uploads" if r else UPLOADS_DIR


def gallery_cache():
    r = _root()
    return r / "gallery_cache.npz" if r else GALLERY_CACHE


# Build identifier shown by /readyz (the Docker image sets the git commit).
APP_VERSION = os.environ.get("APP_VERSION", "dev")