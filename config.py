"""
config.py — all paths and tunable constants in one place.

Nothing in here has side effects (no file I/O, no model loading) so it's
always safe to import from anywhere, including tests.
"""
import os
from pathlib import Path

KNOWN_FACES_DIR = Path("known_faces")
UPLOADS_DIR     = Path("uploads")
MODELS_DIR      = Path("models")
DB_PATH         = "memory_v2.db"
CAREGIVER_PASS  = os.environ.get("CAREGIVER_PASSWORD", "caregiver123")
SECRET_KEY      = os.environ.get("SECRET_KEY", "alzheimer-secret-v3-2024")

YUNET_PATH = MODELS_DIR / "face_detection_yunet_2023mar.onnx"
SFACE_PATH = MODELS_DIR / "face_recognition_sface_2021dec.onnx"
GALLERY_CACHE = Path("gallery_cache.npz")

# Recognition thresholds — SFace cosine similarity, official same-person
# threshold is 0.363. Two bands so the UI can say "recognized" vs "might be".
SCORE_HIGH   = 0.40
SCORE_MEDIUM = 0.32

SMOOTH_WINDOW         = 3   # frames of confidence smoothing
NO_FACE_TIMEOUT       = 25
FRAME_QUEUE_SIZE      = 2
STICKY_FRAMES         = 12  # bridge frames with NO detection (blink/turn)
UNKNOWN_GRACE_FRAMES  = 4   # non-matching frames tolerated before dropping a name

CAM_W, CAM_H = 640, 480