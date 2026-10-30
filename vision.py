"""
vision.py — the recognition engine: YuNet detection, SFace embeddings,
gallery matching, and session-based visit logging.

This module has NO Flask/HTTP knowledge — it's pure domain logic, callable
from the worker thread, from routes, or from tests, with no web server
required. That separation is what let the whole LBPH->SFace engine swap
happen without touching a single route earlier in this project.
"""
import sqlite3
import threading
import time

import cv2
import numpy as np

import config
from database import get_db
from services import speak_greeting

# ── Models (loaded explicitly via load_models(), not at import time) ────
_detector   = None   # cv2.FaceDetectorYN
_recognizer = None   # cv2.FaceRecognizerSF
_det_size_lock = threading.Lock()


def load_models():
    global _detector, _recognizer
    missing = [p for p in (config.YUNET_PATH, config.SFACE_PATH) if not p.exists()]
    if missing:
        print("\n" + "=" * 62)
        print("❌ MISSING MODEL FILES — face recognition cannot start.")
        for m in missing:
            print(f"   not found: {m}")
        print("\n   Fix: run   python download_models.py")
        print("=" * 62 + "\n")
        raise SystemExit(1)
    _detector = cv2.FaceDetectorYN.create(
        str(config.YUNET_PATH), "", (config.CAM_W, config.CAM_H),
        score_threshold=0.7, nms_threshold=0.3, top_k=50
    )
    _recognizer = cv2.FaceRecognizerSF.create(str(config.SFACE_PATH), "")
    print("✅ YuNet detector + SFace recognizer loaded")


def detect_faces(bgr):
    """Run YuNet on a BGR frame. Returns Nx15 float array (or []):
    [x, y, w, h, 5 landmark pairs..., score] per row."""
    if _detector is None:
        return []
    h, w = bgr.shape[:2]
    with _det_size_lock:
        _detector.setInputSize((w, h))
        ok, faces = _detector.detect(bgr)
    if faces is None:
        return []
    return faces


def embed_face(bgr, face_row):
    """Align + crop using landmarks, then compute the 128-d embedding."""
    aligned = _recognizer.alignCrop(bgr, face_row)
    return _recognizer.feature(aligned)


def cosine_match(feat, gallery_feats):
    """Best cosine similarity of feat vs every gallery embedding."""
    best = -1.0
    for g in gallery_feats:
        s = float(_recognizer.match(feat, g, cv2.FaceRecognizerSF_FR_COSINE))
        if s > best:
            best = s
    return best


# ── Gallery (enrolled-face embeddings) ───────────────────────────────
_gallery      = {}   # pid -> [np.ndarray, ...]
_name_map     = {}   # pid -> display name
_gallery_lock = threading.Lock()
_match_cache  = (None, None, [])   # (gallery it was built from, unit-row matrix, pid per row)


def _match_matrix(gallery):
    """Every embedding in `gallery` as one L2-normalised row, plus the pid of
    each row, so a frame is scored against the whole gallery in one matrix
    product (the same cosine similarity as cosine_match). Rebuilt only when
    the gallery dict is replaced, which load_known_faces() does on every
    reload. Call with _gallery_lock held."""
    global _match_cache
    built_from, matrix, owners = _match_cache
    if built_from is not gallery:
        owners = [pid for pid, feats in gallery.items() for _ in feats]
        rows = [np.asarray(f, dtype=np.float32).reshape(-1) for feats in gallery.values() for f in feats]
        matrix = np.vstack(rows) if rows else np.zeros((0, 128), np.float32)
        matrix /= np.maximum(np.linalg.norm(matrix, axis=1, keepdims=True), 1e-12)
        _match_cache = (gallery, matrix, owners)
    return matrix, owners


def _embed_photo_file(path):
    img = cv2.imread(str(path))
    if img is None:
        return []
    h, w = img.shape[:2]
    if max(h, w) < 250:
        scale = 250.0 / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)))
    faces = detect_faces(img)
    if len(faces) == 0:
        pad = int(0.3 * max(img.shape[:2]))
        padded = cv2.copyMakeBorder(img, pad, pad, pad, pad, cv2.BORDER_REPLICATE)
        faces = detect_faces(padded)
        if len(faces) == 0:
            return []
        img = padded
    face_row = max(faces, key=lambda f: f[2] * f[3])
    try:
        return [embed_face(img, face_row)]
    except Exception:
        return []


def _load_cache():
    if not config.GALLERY_CACHE.exists():
        return {}
    try:
        data = np.load(str(config.GALLERY_CACHE), allow_pickle=False)
        paths, mtimes, feats = list(data["paths"]), list(data["mtimes"]), data["feats"]
        return {str(p): (float(m), feats[i]) for i, (p, m) in enumerate(zip(paths, mtimes))}
    except Exception:
        return {}


def _save_cache(cache):
    if not cache:
        return
    paths  = np.array(list(cache.keys()))
    mtimes = np.array([v[0] for v in cache.values()])
    feats  = np.stack([np.asarray(v[1]).reshape(-1) for v in cache.values()])
    np.savez(str(config.GALLERY_CACHE), paths=paths, mtimes=mtimes, feats=feats)


def load_known_faces():
    """Build/refresh the gallery, using the per-photo embedding cache so
    only new photos are re-embedded."""
    global _gallery, _name_map
    cache = _load_cache()
    new_gallery, new_names = {}, {}
    embedded, cached_hits = 0, 0
    with get_db() as c:
        people = c.execute("SELECT id,name FROM people").fetchall()
    for p in people:
        pid, pname = p["id"], p["name"]
        face_dir = config.KNOWN_FACES_DIR / pid
        if not face_dir.exists():
            continue
        new_names[pid] = pname
        feats = []
        for f in sorted(face_dir.iterdir()):
            if f.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                continue
            key, mtime = str(f.resolve()), f.stat().st_mtime
            hit = cache.get(key)
            if hit is not None and abs(hit[0] - mtime) < 1e-6:
                feats.append(np.asarray(hit[1], dtype=np.float32).reshape(1, -1))
                cached_hits += 1
                continue
            for feat in _embed_photo_file(f):
                arr = np.asarray(feat, dtype=np.float32).reshape(1, -1)
                feats.append(arr)
                cache[key] = (mtime, arr.reshape(-1))
                embedded += 1
        if feats:
            new_gallery[pid] = feats
    with _gallery_lock:
        _gallery, _name_map = new_gallery, new_names
    _save_cache(cache)
    total = sum(len(v) for v in new_gallery.values())
    print(f"✅ Gallery: {total} embeddings for {len(new_gallery)} people "
          f"({embedded} newly computed, {cached_hits} from cache)")
    if total == 0:
        print("⚠️  No usable faces — add people via caregiver panel")


def display_name(pid):
    """The enrolled person's current name. Always read through here: every
    gallery reload replaces _name_map, so a reference imported earlier
    would go stale."""
    return _name_map.get(pid)


def models_loaded():
    return _detector is not None and _recognizer is not None


def gallery_counts():
    """{pid: number of usable embeddings} — what 'enrolled' really means."""
    with _gallery_lock:
        return {pid: len(feats) for pid, feats in _gallery.items()}


def assess_enrollment_photo(bgr):
    """Classify an uploaded enrollment photo: 'accepted' (exactly one face),
    'no_face' or 'multiple_faces'. Mirrors _embed_photo_file's upscaling
    and padding so a photo accepted here can also be embedded."""
    h, w = bgr.shape[:2]
    if max(h, w) < 250:
        scale = 250.0 / max(h, w)
        bgr = cv2.resize(bgr, (int(w * scale), int(h * scale)))
    faces = detect_faces(bgr)
    if len(faces) == 0:
        pad = int(0.3 * max(bgr.shape[:2]))
        faces = detect_faces(cv2.copyMakeBorder(bgr, pad, pad, pad, pad, cv2.BORDER_REPLICATE))
    if len(faces) == 0:
        return "no_face"
    if len(faces) > 1:
        return "multiple_faces"
    return "accepted"


def recognize(bgr, face_row):
    """Returns (pid, score, name), or (None, best_score, None) if nobody
    clears SCORE_MEDIUM. This is the open-set rejection boundary — an
    empty or unmatched gallery must never guess."""
    with _gallery_lock:
        matrix, owners = _match_matrix(_gallery)
        names = _name_map
    if not owners:
        return None, 0.0, None
    try:
        feat = embed_face(bgr, face_row)
    except Exception as e:
        print(f"[RECOG ERROR] {e}")
        return None, 0.0, None
    query = np.asarray(feat, dtype=np.float32).reshape(-1)
    scores = matrix @ (query / max(float(np.linalg.norm(query)), 1e-12))
    best = int(np.argmax(scores))            # first best row, like the old per-person loop
    best_pid, best_score = owners[best], float(scores[best])
    print(f"[RECOG] best={names.get(best_pid, '?')} score={best_score:.3f}")
    if best_score >= config.SCORE_MEDIUM:
        return best_pid, best_score, names.get(best_pid)
    return None, best_score, None


# ── Session-based visit tracking ──────────────────────────────────────
class VisitTracker:
    """
    A "visit" represents one continuous presence, not one recognition frame.
    See the project README for the full rationale — in short: logging only
    on confident matches plus a cooldown-based close stops the log filling
    with hundreds of duplicate rows for one person moving around in frame.
    """
    VISIT_COOLDOWN_S = 30

    def __init__(self):
        self._visit_id  = None
        self._person_id = None
        self._start     = None
        self._last_seen = None
        self._lock      = threading.Lock()

    def seen(self, pid, conf, emotion=None):
        with self._lock:
            now = time.time()
            if self._person_id == pid and self._visit_id is not None:
                self._last_seen = now
                return
            if self._person_id is not None and self._person_id != pid:
                self._close()
            if not pid:
                return
            try:
                with get_db() as c:
                    cur = c.execute(
                        "INSERT INTO visits (person_id,confidence,emotion) VALUES(?,?,?)",
                        (pid, conf, emotion))
            except sqlite3.IntegrityError:
                # Deleted moments ago but still in the in-memory gallery
                # until it reloads: record nothing rather than fail.
                return
            self._visit_id  = cur.lastrowid
            self._person_id = pid
            self._start     = now
            self._last_seen = now
            speak_greeting(pid)

    def tick(self):
        with self._lock:
            if self._visit_id is None or self._last_seen is None:
                return
            if time.time() - self._last_seen > self.VISIT_COOLDOWN_S:
                self._close()

    def gone(self):
        pass

    def _close(self):
        if self._visit_id and self._start:
            dur = int((self._last_seen or time.time()) - self._start)
            with get_db() as c:
                c.execute(
                    "UPDATE visits SET ended_at=CURRENT_TIMESTAMP,duration_s=? WHERE id=?",
                    (dur, self._visit_id))
        self._visit_id = self._person_id = self._start = self._last_seen = None


visit_tracker = VisitTracker()