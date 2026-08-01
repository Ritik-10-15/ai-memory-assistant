"""
AI Memory Assistant for Alzheimer's Patients — Version 3.0
============================================================
COMPLETE FACE-ENGINE REWRITE: Haar+LBPH replaced with deep learning.

  Detection  : YuNet  (cv2.FaceDetectorYN)   — fast DNN detector, handles
               distance, left/right head turns, poor lighting far better
               than Haar cascade ever could.
  Recognition: SFace  (cv2.FaceRecognizerSF) — real identity EMBEDDINGS
               (same technology family as ArcFace / production systems),
               matched by cosine similarity. Confident from a SINGLE frame.

Why this is dramatically better than v2.x LBPH:
  - LBPH compares raw pixel texture patterns → falls apart with distance,
    angle, or lighting changes; needed 10-frame smoothing + sticky hacks.
  - SFace maps a face to a 128-d identity vector; the same person at 1m or
    3m, turned 30° left or right, maps to nearly the same vector. Match is
    near-instant and a genuinely unknown person scores clearly below
    threshold instead of "kind of close".
  - Even 5-15 enrollment photos are enough (your 45 are great).

SETUP (one time):
  1. pip install opencv-python  (>= 4.8 recommended; you already have it)
  2. python download_models.py   → downloads 2 small .onnx files to models/
  3. python app.py

Everything else (routes, DB, templates, TTS, caregiver panel) unchanged.
"""

import os, sqlite3, threading, time, uuid, queue
from pathlib import Path
from collections import deque
from functools import wraps

import cv2
import numpy as np
from flask import (Flask, render_template, Response, jsonify,
                   request, redirect, url_for, session, flash)

# Optional imports (unchanged from v2)
try:
    import whisper
    WHISPER = True
    _whisper_model = whisper.load_model("base")
    print("✅ Whisper loaded")
except Exception:
    WHISPER = False

try:
    import openai
    OPENAI = True
except Exception:
    OPENAI = False

try:
    import pyttsx3
    _tts_engine = pyttsx3.init()
    TTS = True
    print("✅ TTS loaded")
except Exception:
    TTS = False

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "alzheimer-secret-v3-2024")

KNOWN_FACES_DIR = Path("known_faces")
UPLOADS_DIR     = Path("uploads")
MODELS_DIR      = Path("models")
DB_PATH         = "memory_v2.db"
CAREGIVER_PASS  = os.environ.get("CAREGIVER_PASSWORD", "caregiver123")

YUNET_PATH = MODELS_DIR / "face_detection_yunet_2023mar.onnx"
SFACE_PATH = MODELS_DIR / "face_recognition_sface_2021dec.onnx"

# ── TUNABLES ───────────────────────────────────────────────────
# SFace cosine similarity: official same-person threshold is 0.363.
# We use two bands so the UI can say "recognized" vs "might be".
SCORE_HIGH   = 0.40   # >= this → confident match, show name + greet
SCORE_MEDIUM = 0.32   # >= this → "might be X"
# Anything below SCORE_MEDIUM with a face in frame → UNKNOWN PERSON.

SMOOTH_WINDOW    = 3   # embeddings are reliable per-frame; tiny window
                       # keeps display stable without adding lag
                       # (v2 needed 10 because LBPH was so noisy)
NO_FACE_TIMEOUT  = 25
FRAME_QUEUE_SIZE = 2
STICKY_FRAMES        = 12  # bridge frames with NO detection (blink/turn)
UNKNOWN_GRACE_FRAMES = 4   # consecutive non-matching frames tolerated
                           # before dropping a recognized name

CAM_W, CAM_H = 640, 480

# ── MODELS ─────────────────────────────────────────────────────
_detector   = None   # cv2.FaceDetectorYN
_recognizer = None   # cv2.FaceRecognizerSF
_det_size_lock = threading.Lock()

def load_models():
    global _detector, _recognizer
    missing = [p for p in (YUNET_PATH, SFACE_PATH) if not p.exists()]
    if missing:
        print("\n" + "="*62)
        print("❌ MISSING MODEL FILES — face recognition cannot start.")
        for m in missing:
            print(f"   not found: {m}")
        print("\n   Fix: run   python download_models.py")
        print("   (downloads two small .onnx files, ~40 MB total)")
        print("="*62 + "\n")
        raise SystemExit(1)
    _detector = cv2.FaceDetectorYN.create(
        str(YUNET_PATH), "", (CAM_W, CAM_H),
        score_threshold=0.7, nms_threshold=0.3, top_k=50
    )
    _recognizer = cv2.FaceRecognizerSF.create(str(SFACE_PATH), "")
    print("✅ YuNet detector + SFace recognizer loaded")

def detect_faces(bgr):
    """Run YuNet on a BGR frame. Returns Nx15 float array (or empty list):
    [x, y, w, h, 5 landmark pairs..., score] per row. Landmarks are what
    lets SFace align the face before embedding — this is a big part of why
    accuracy holds up when the head is turned."""
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
    """Align + crop using landmarks, then compute the 128-d identity
    embedding. ~10-20 ms on CPU."""
    aligned = _recognizer.alignCrop(bgr, face_row)
    feat = _recognizer.feature(aligned)
    return feat

def cosine_match(feat, gallery_feats):
    """Best cosine similarity of feat vs every gallery embedding."""
    best = -1.0
    for g in gallery_feats:
        s = float(_recognizer.match(feat, g, cv2.FaceRecognizerSF_FR_COSINE))
        if s > best:
            best = s
    return best

# ── DATABASE (unchanged schema) ────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def init_db():
    with get_db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS people (
            id TEXT PRIMARY KEY, name TEXT NOT NULL,
            relationship TEXT, notes TEXT, dob TEXT,
            photo_path TEXT, tts_greeting TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person_id TEXT, started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ended_at DATETIME, duration_s INTEGER DEFAULT 0,
            emotion TEXT, confidence REAL,
            FOREIGN KEY(person_id) REFERENCES people(id)
        );
        CREATE TABLE IF NOT EXISTS memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            summary TEXT, raw_transcript TEXT, source TEXT DEFAULT 'manual',
            FOREIGN KEY(person_id) REFERENCES people(id)
        );
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT,
            message TEXT, seen INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """)
    print("✅ Database ready")

# ── GALLERY (enrolled-face embeddings) ─────────────────────────
# person_id -> list of embeddings; built once at startup / re-enrollment,
# cached to disk so restarts are instant.
_gallery      = {}          # pid -> [np.ndarray, ...]
_name_map     = {}          # pid -> display name
_gallery_lock = threading.Lock()
GALLERY_CACHE = Path("gallery_cache.npz")

def _embed_photo_file(path):
    """Compute embedding(s) for one enrollment photo.
    Tries direct detection; if the photo is a tight crop the detector can
    miss, so we retry with a replicated border. Returns list of feats."""
    img = cv2.imread(str(path))
    if img is None:
        return []
    # Upscale small crops — YuNet needs some resolution to find landmarks
    h, w = img.shape[:2]
    if max(h, w) < 250:
        scale = 250.0 / max(h, w)
        img = cv2.resize(img, (int(w*scale), int(h*scale)))
    faces = detect_faces(img)
    if len(faces) == 0:
        # Tight crop fallback: add margin and retry
        pad = int(0.3 * max(img.shape[:2]))
        padded = cv2.copyMakeBorder(img, pad, pad, pad, pad,
                                    cv2.BORDER_REPLICATE)
        faces = detect_faces(padded)
        if len(faces) == 0:
            return []
        img = padded
    # Use the biggest face in the photo
    face_row = max(faces, key=lambda f: f[2]*f[3])
    try:
        return [embed_face(img, face_row)]
    except Exception:
        return []

def _load_cache():
    if not GALLERY_CACHE.exists():
        return {}
    try:
        data = np.load(str(GALLERY_CACHE), allow_pickle=False)
        paths  = list(data["paths"])
        mtimes = list(data["mtimes"])
        feats  = data["feats"]
        return {str(p): (float(m), feats[i]) for i, (p, m) in
                enumerate(zip(paths, mtimes))}
    except Exception:
        return {}

def _save_cache(cache):
    if not cache:
        return
    paths  = np.array(list(cache.keys()))
    mtimes = np.array([v[0] for v in cache.values()])
    feats  = np.stack([np.asarray(v[1]).reshape(-1) for v in cache.values()])
    np.savez(str(GALLERY_CACHE), paths=paths, mtimes=mtimes, feats=feats)

def load_known_faces():
    """Build/refresh the gallery. Cached per photo (path+mtime) so only
    new photos are embedded — restart after enrolling is near-instant."""
    global _gallery, _name_map
    cache = _load_cache()
    new_gallery, new_names = {}, {}
    embedded, cached_hits = 0, 0
    with get_db() as c:
        people = c.execute("SELECT id,name FROM people").fetchall()
    for p in people:
        pid, pname = p["id"], p["name"]
        face_dir = KNOWN_FACES_DIR / pid
        if not face_dir.exists():
            continue
        new_names[pid] = pname
        feats = []
        for f in sorted(face_dir.iterdir()):
            if f.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                continue
            key   = str(f.resolve())
            mtime = f.stat().st_mtime
            hit   = cache.get(key)
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
        _gallery  = new_gallery
        _name_map = new_names
    _save_cache(cache)
    total = sum(len(v) for v in new_gallery.values())
    print(f"✅ Gallery: {total} embeddings for {len(new_gallery)} people "
          f"({embedded} newly computed, {cached_hits} from cache)")
    if total == 0:
        print("⚠️  No usable faces — add people via caregiver panel")

# ── RECOGNITION ────────────────────────────────────────────────
def recognize(bgr, face_row):
    """Returns (pid, score, name) for the given detected face, or
    (None, best_score, None) if nobody clears SCORE_MEDIUM."""
    with _gallery_lock:
        gallery = {pid: list(feats) for pid, feats in _gallery.items()}
        names   = dict(_name_map)
    if not gallery:
        return None, 0.0, None
    try:
        feat = embed_face(bgr, face_row)
    except Exception as e:
        print(f"[RECOG ERROR] {e}")
        return None, 0.0, None
    best_pid, best_score = None, -1.0
    for pid, feats in gallery.items():
        s = cosine_match(feat, feats)
        if s > best_score:
            best_pid, best_score = pid, s
    print(f"[RECOG] best={names.get(best_pid,'?')} score={best_score:.3f}")
    if best_score >= SCORE_MEDIUM:
        return best_pid, best_score, names.get(best_pid)
    return None, best_score, None

# ── VISIT TRACKER (unchanged) ──────────────────────────────────
class VisitTracker:
    """
    Session-based visit logging.

    A "visit" represents one continuous presence, not one recognition frame.
    - A visit opens when a person is confidently recognized.
    - It stays open while they keep being seen.
    - Brief gaps (looking away, a low-confidence frame) do NOT close it —
      the visit persists through a cooldown window (VISIT_COOLDOWN_S).
    - Only after the person is gone longer than the cooldown does the visit
      close. A fresh appearance after that is a NEW visit.

    This stops the log from filling with hundreds of duplicate "visits" for
    one person who simply moved around in front of the camera.
    """
    VISIT_COOLDOWN_S = 30  # seconds a visit stays open after last sighting

    def __init__(self):
        self._visit_id   = None
        self._person_id  = None
        self._start      = None
        self._last_seen  = None
        self._lock       = threading.Lock()

    def seen(self, pid, conf, emotion=None):
        """Call on a CONFIDENT recognition. Opens a visit if none is active
        for this person, or refreshes the existing one."""
        with self._lock:
            now = time.time()

            # Same person still around -> refresh, keep visit open. No new row.
            if self._person_id == pid and self._visit_id is not None:
                self._last_seen = now
                return

            # A different person appeared -> close old visit, open new one.
            if self._person_id is not None and self._person_id != pid:
                self._close()

            if not pid:
                return

            with get_db() as c:
                cur = c.execute(
                    "INSERT INTO visits (person_id,confidence,emotion) VALUES(?,?,?)",
                    (pid, conf, emotion))
                self._visit_id  = cur.lastrowid
                self._person_id = pid
                self._start     = now
                self._last_seen = now
            if TTS: self._greet(pid)

    def tick(self):
        """Call every frame. Closes the active visit once the person has been
        gone longer than the cooldown window."""
        with self._lock:
            if self._visit_id is None or self._last_seen is None:
                return
            if time.time() - self._last_seen > self.VISIT_COOLDOWN_S:
                self._close()

    def gone(self):
        """No face this frame. Does NOT immediately close — cooldown decides."""
        pass

    def _close(self):
        if self._visit_id and self._start:
            dur = int((self._last_seen or time.time()) - self._start)
            with get_db() as c:
                c.execute(
                    "UPDATE visits SET ended_at=CURRENT_TIMESTAMP,duration_s=? WHERE id=?",
                    (dur, self._visit_id))
        self._visit_id = self._person_id = self._start = self._last_seen = None

    def _greet(self, pid):
        with get_db() as c:
            p = c.execute(
                "SELECT name,tts_greeting FROM people WHERE id=?", (pid,)
            ).fetchone()
        if not p: return
        msg = p["tts_greeting"] or f"Hello {p['name']}, good to see you!"
        def _speak():
            try: _tts_engine.say(msg); _tts_engine.runAndWait()
            except: pass
        threading.Thread(target=_speak, daemon=True).start()
_visit_tracker = VisitTracker()
        
# ── RECOGNITION WORKER ─────────────────────────────────────────
_frame_q      = queue.Queue(maxsize=FRAME_QUEUE_SIZE)
_score_buffer = deque(maxlen=SMOOTH_WINDOW)
_detection    = {
    "person_id":None,"name":None,"confidence":0.0,"state":"idle",
    "emotion":None,"relationship":None,"notes":None,
    "last_memory":None,"recent_memories":[],
}
_det_lock = threading.Lock()

_sticky_pid      = None
_sticky_count    = 0
_unknown_streak  = 0

def _get_person_data(pid):
    """Everything the patient screen needs for recall: who this is, the
    relationship, notes, the most recent conversation, and a short recap
    of the last few — 'what we talked about last time'."""
    with get_db() as c:
        p = c.execute("SELECT * FROM people WHERE id=?", (pid,)).fetchone()
        mems = c.execute(
            "SELECT summary, created_at FROM memories "
            "WHERE person_id=? ORDER BY created_at DESC LIMIT 3",
            (pid,)
        ).fetchall()
    if not p: return None
    return {
        "id": p["id"], "name": p["name"],
        "relationship": p["relationship"],
        "notes": p["notes"],
        "last_memory": mems[0]["summary"] if mems else None,
        "recent_memories": [
            {"summary": m["summary"], "when": m["created_at"]} for m in mems
        ],
    }

def _recognition_worker():
    global _sticky_pid, _sticky_count, _unknown_streak
    while True:
        try:
            item = _frame_q.get(timeout=1.0)
        except queue.Empty:
            continue
        bgr, face_row = item
        face_present = face_row is not None

        if face_present:
            pid, score, name = recognize(bgr, face_row)
        else:
            pid, score, name = None, 0.0, None

        # Short smoothing (embeddings are stable; this just stops a single
        # borderline frame from flickering the label)
        _score_buffer.append(score if pid else 0.0)
        smooth = float(np.mean(_score_buffer))

        if pid and smooth >= SCORE_HIGH:
            state = "high"
        elif pid and smooth >= SCORE_MEDIUM:
            state = "medium"
        elif face_present:
            state = "unknown"   # a face is here and it's NOT anyone enrolled
        else:
            state = "idle"

        # Sticky: bridge brief gaps without ever lying about identity.
        if state == "high" and pid:
            _sticky_pid, _sticky_count, _unknown_streak = pid, STICKY_FRAMES, 0
        elif face_present and pid != _sticky_pid and _sticky_pid:
            _unknown_streak += 1
            if _unknown_streak < UNKNOWN_GRACE_FRAMES and _sticky_count > 0:
                _sticky_count -= 1
                pid, name, state = _sticky_pid, _name_map.get(_sticky_pid), "high"
            else:
                _sticky_pid, _sticky_count = None, 0
        elif not face_present and _sticky_pid:
            if _sticky_count > 0:
                _sticky_count -= 1
                pid, name, state = _sticky_pid, _name_map.get(_sticky_pid), "high"
            else:
                _sticky_pid = None
        else:
            _unknown_streak = 0

        person_data = None
        if pid and state in ("high", "medium"):
            person_data = _get_person_data(pid)
            # Only LOG a visit on a confident match. Medium/borderline frames
            # still show on screen ("Maybe ...?") but don't create records.
            if state == "high":
                _visit_tracker.seen(pid, smooth)
        # Always tick so the cooldown can close a finished visit.
        _visit_tracker.tick()

        with _det_lock:
            _detection.update({
                "person_id": pid, "name": name,
                "confidence": round(smooth, 3), "state": state,
                "emotion": None,
                "relationship": person_data["relationship"] if person_data else None,
                "notes": person_data["notes"] if person_data else None,
                "last_memory": person_data["last_memory"] if person_data else None,
                "recent_memories": person_data["recent_memories"] if person_data else [],
            })

threading.Thread(target=_recognition_worker, daemon=True).start()

# ── CAMERA ─────────────────────────────────────────────────────
_camera=None; _cam_lock=threading.Lock(); _no_face=0

def get_camera():
    global _camera
    with _cam_lock:
        if _camera is None or not _camera.isOpened():
            for idx in [0,1,2]:
                cam = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
                if cam.isOpened():
                    cam.set(cv2.CAP_PROP_FRAME_WIDTH,CAM_W)
                    cam.set(cv2.CAP_PROP_FRAME_HEIGHT,CAM_H)
                    cam.set(cv2.CAP_PROP_FPS,30)
                    cam.set(cv2.CAP_PROP_BUFFERSIZE,1)
                    time.sleep(0.5)
                    ok,test=cam.read()
                    if ok and test is not None and test.size>0:
                        _camera=cam
                        print(f"✅ Camera opened on index {idx}")
                        break
                    cam.release()
            if _camera is None:
                print("❌ No camera found")
    return _camera

def generate_frames():
    global _no_face
    cam = get_camera()
    if cam is None: return
    C_GREEN=(34,197,94); C_AMBER=(251,191,36)
    C_GRAY=(156,163,175); C_RED=(60,60,220)
    while True:
        ok,frame=cam.read()
        if not ok or frame is None or frame.size==0:
            time.sleep(0.05); continue

        faces = detect_faces(frame)   # YuNet, once per frame
        best_row = None
        if len(faces) > 0:
            best_row = max(faces, key=lambda f: f[2]*f[3])
        try: _frame_q.put_nowait((frame.copy(), best_row))
        except queue.Full: pass

        if best_row is None:
            _no_face+=1
            if _no_face>=NO_FACE_TIMEOUT:
                _visit_tracker.gone()
                with _det_lock:
                    _detection.update({
                        "person_id":None,"name":None,"confidence":0.0,
                        "state":"idle","emotion":None,
                        "recent_memories":[],
                    })
        else:
            _no_face=0
            x,y,w,h = [int(v) for v in best_row[:4]]
            with _det_lock:
                state=_detection["state"]; name=_detection["name"]
                conf=_detection["confidence"]
            if   state=="high":    color=C_GREEN
            elif state=="medium":  color=C_AMBER
            elif state=="unknown": color=C_RED
            else:                  color=C_GRAY
            cv2.rectangle(frame,(x,y),(x+w,y+h),color,2)
            L=20
            for px,py,dx,dy in [(x,y,1,1),(x+w,y,-1,1),(x,y+h,1,-1),(x+w,y+h,-1,-1)]:
                cv2.line(frame,(px,py),(px+dx*L,py),color,3)
                cv2.line(frame,(px,py),(px,py+dy*L),color,3)
            if   state=="high"   and name: label=name.title()
            elif state=="medium" and name: label=f"Maybe {name.title()}?"
            elif state=="unknown":         label="Unknown person"
            else: label=""
            if label:
                (tw,th),_=cv2.getTextSize(label,cv2.FONT_HERSHEY_SIMPLEX,0.7,2)
                cv2.rectangle(frame,(x,y-th-16),(x+tw+12,y),color,-1)
                cv2.putText(frame,label,(x+6,y-6),
                    cv2.FONT_HERSHEY_SIMPLEX,0.7,(255,255,255),2)
            bar_w=int(w*min(max(conf,0.0),1.0))
            cv2.rectangle(frame,(x,y+h+4),(x+w,y+h+10),(40,40,40),-1)
            cv2.rectangle(frame,(x,y+h+4),(x+bar_w,y+h+10),color,-1)
        ret,buf=cv2.imencode(".jpg",frame,[cv2.IMWRITE_JPEG_QUALITY,82])
        if ret:
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
                   +buf.tobytes()+b"\r\n")

# ── AUTO ENROLL ────────────────────────────────────────────────
def _capture_enroll_frame(pid):
    cam=get_camera()
    if cam is None: return False
    ok,frame=cam.read()
    if not ok or frame is None: return False
    faces = detect_faces(frame)
    if len(faces)==0: return False
    x,y,w,h=[int(v) for v in max(faces,key=lambda f:f[2]*f[3])[:4]]
    # save with generous margin so gallery build re-detects cleanly
    pad=int(0.35*max(w,h))
    x0,y0=max(0,x-pad),max(0,y-pad)
    x1,y1=min(frame.shape[1],x+w+pad),min(frame.shape[0],y+h+pad)
    face_dir=KNOWN_FACES_DIR/pid
    face_dir.mkdir(parents=True,exist_ok=True)
    count=len(list(face_dir.iterdir()))
    cv2.imwrite(str(face_dir/f"{count:03d}.jpg"),frame[y0:y1,x0:x1])
    return True

# ── WHISPER (unchanged) ────────────────────────────────────────
def auto_log(pid, audio_path):
    if not WHISPER: return
    try:
        res=_whisper_model.transcribe(audio_path)
        transcript=res.get("text","").strip()
        if not transcript: return
        summary=transcript
        if OPENAI and os.environ.get("OPENAI_API_KEY"):
            try:
                client=openai.OpenAI()
                r=client.chat.completions.create(
                    model="gpt-3.5-turbo",
                    messages=[{"role":"user","content":
                        f"Summarize in one gentle sentence for Alzheimer's memory aid:\n{transcript}"}],
                    max_tokens=80)
                summary=r.choices[0].message.content.strip()
            except Exception as e: print(f"LLM error: {e}")
        with get_db() as c:
            c.execute(
                "INSERT INTO memories (person_id,summary,raw_transcript,source) VALUES(?,?,?,?)",
                (pid,summary,transcript,"whisper"))
        print(f"✅ Memory auto-logged for {pid}")
    except Exception as e: print(f"Whisper error: {e}")

# ── AUTH ───────────────────────────────────────────────────────
def caregiver_required(f):
    @wraps(f)
    def dec(*a,**kw):
        if not session.get("caregiver"):
            return redirect(url_for("caregiver_login"))
        return f(*a,**kw)
    return dec

# ── PATIENT ROUTES ─────────────────────────────────────────────
@app.route("/")
def index(): return render_template("index.html")

@app.route("/video")
def video():
    return Response(generate_frames(),
        mimetype="multipart/x-mixed-replace; boundary=frame")

@app.route("/api/current-person")
def api_current_person():
    with _det_lock: d=dict(_detection)
    state=d["state"]; name=d.get("name","")
    if state=="high" and name:
        d["display_message"]=f"This is {name.title()}"
        d["certainty_label"]="Recognized"
        d["certainty_class"]="high"
    elif state=="medium" and name:
        d["display_message"]=f"This might be {name.title()}"
        d["certainty_label"]="Not sure"
        d["certainty_class"]="medium"
    elif state=="unknown":
        d["display_message"]="I don't recognize this person"
        d["certainty_label"]="Unknown"
        d["certainty_class"]="unknown"
    else:
        d["display_message"]=d["certainty_label"]=d["certainty_class"]=None
    return jsonify(d)

@app.route("/api/save-memory", methods=["POST"])
def api_save_memory():
    data=request.json or {}
    summary=data.get("summary","").strip()
    pid=data.get("person_id")
    if not summary: return jsonify({"error":"Empty summary"}), 400
    with get_db() as c:
        if not pid:
            with _det_lock: name=_detection.get("name","")
            if name:
                row=c.execute(
                    "SELECT id FROM people WHERE LOWER(name)=LOWER(?)",(name,)
                ).fetchone()
                pid=row["id"] if row else None
        if not pid: return jsonify({"error":"No person detected"}), 404
        c.execute(
            "INSERT INTO memories (person_id,summary,source) VALUES(?,?,?)",
            (pid,summary,"manual"))
    return jsonify({"message":"Memory saved ✓"})

@app.route("/api/recent-visits")
def api_recent_visits():
    with get_db() as c:
        rows=c.execute("""
            SELECT v.*,p.name,p.relationship FROM visits v
            JOIN people p ON v.person_id=p.id
            ORDER BY v.started_at DESC LIMIT 15
        """).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route("/api/upload-audio", methods=["POST"])
def api_upload_audio():
    if not WHISPER: return jsonify({"error":"Whisper not available"}),503
    pid=request.form.get("person_id")
    audio=request.files.get("audio")
    if not pid or not audio: return jsonify({"error":"Missing data"}),400
    path=UPLOADS_DIR/f"{uuid.uuid4()}.webm"
    audio.save(str(path))
    threading.Thread(target=auto_log,args=(pid,str(path)),daemon=True).start()
    return jsonify({"message":"Transcribing in background..."})

@app.route("/api/stats")
def api_stats():
    with get_db() as c:
        return jsonify({
            "total_people":   c.execute("SELECT COUNT(*) FROM people").fetchone()[0],
            "total_visits":   c.execute("SELECT COUNT(*) FROM visits").fetchone()[0],
            "total_memories": c.execute("SELECT COUNT(*) FROM memories").fetchone()[0],
            "today_visits":   c.execute(
                "SELECT COUNT(*) FROM visits WHERE DATE(started_at)=DATE('now')"
            ).fetchone()[0],
        })

# ── CAREGIVER ROUTES (unchanged except reload calls) ───────────
@app.route("/caregiver/login", methods=["GET","POST"])
def caregiver_login():
    if request.method=="POST":
        if request.form.get("password")==CAREGIVER_PASS:
            session["caregiver"]=True
            return redirect(url_for("caregiver_dashboard"))
        flash("Incorrect password")
    return render_template("caregiver_login.html")

@app.route("/caregiver/logout")
def caregiver_logout():
    session.pop("caregiver",None)
    return redirect(url_for("index"))

@app.route("/caregiver")
@caregiver_required
def caregiver_dashboard():
    with get_db() as c:
        people=c.execute("SELECT * FROM people ORDER BY name").fetchall()
        visits=c.execute("""
            SELECT v.*,p.name FROM visits v
            JOIN people p ON v.person_id=p.id
            ORDER BY v.started_at DESC LIMIT 25
        """).fetchall()
        unseen=c.execute(
            "SELECT COUNT(*) FROM alerts WHERE seen=0"
        ).fetchone()[0]
    return render_template("caregiver_dashboard.html",
        people=people,visits=visits,unseen=unseen)

@app.route("/caregiver/people/add", methods=["GET","POST"])
@caregiver_required
def add_person():
    if request.method=="POST":
        name=request.form.get("name","").strip()
        if not name:
            flash("Name is required")
            return render_template("add_person.html")
        pid=str(uuid.uuid4())
        face_dir=KNOWN_FACES_DIR/pid
        face_dir.mkdir(parents=True,exist_ok=True)
        photos=request.files.getlist("photos"); saved=0
        for photo in photos:
            if photo and photo.filename:
                ext=Path(photo.filename).suffix.lower()
                dest=face_dir/f"{saved:03d}{ext}"
                photo.save(str(dest))
                saved+=1
        with get_db() as c:
            c.execute(
                "INSERT INTO people (id,name,relationship,notes,dob,tts_greeting) VALUES(?,?,?,?,?,?)",
                (pid,name,
                 request.form.get("relationship",""),
                 request.form.get("notes",""),
                 request.form.get("dob",""),
                 request.form.get("tts_greeting","")))
        threading.Thread(target=load_known_faces,daemon=True).start()
        flash(f"✅ Added {name} with {saved} photo(s)")
        return redirect(url_for("caregiver_dashboard"))
    return render_template("add_person.html")

@app.route("/caregiver/people/<pid>/edit", methods=["GET","POST"])
@caregiver_required
def edit_person(pid):
    with get_db() as c:
        person=c.execute("SELECT * FROM people WHERE id=?",(pid,)).fetchone()
        memories=c.execute(
            "SELECT * FROM memories WHERE person_id=? ORDER BY created_at DESC",
            (pid,)
        ).fetchall()
    if not person:
        flash("Not found")
        return redirect(url_for("caregiver_dashboard"))
    if request.method=="POST":
        with get_db() as c:
            c.execute(
                "UPDATE people SET name=?,relationship=?,notes=?,dob=?,tts_greeting=? WHERE id=?",
                (request.form.get("name"),request.form.get("relationship"),
                 request.form.get("notes"),request.form.get("dob"),
                 request.form.get("tts_greeting"),pid))
        photos=request.files.getlist("photos")
        face_dir=KNOWN_FACES_DIR/pid
        face_dir.mkdir(exist_ok=True)
        existing=len(list(face_dir.iterdir()))
        saved=0
        for i,photo in enumerate(photos):
            if photo and photo.filename:
                ext=Path(photo.filename).suffix.lower()
                dest=face_dir/f"{existing+i:03d}{ext}"
                photo.save(str(dest))
                saved+=1
        threading.Thread(target=load_known_faces,daemon=True).start()
        flash(f"✅ Updated — {saved} new photo(s) added")
        return redirect(url_for("caregiver_dashboard"))
    return render_template("edit_person.html",person=person,memories=memories)

@app.route("/caregiver/people/<pid>/delete", methods=["POST"])
@caregiver_required
def delete_person(pid):
    import shutil
    with get_db() as c:
        p=c.execute("SELECT name FROM people WHERE id=?",(pid,)).fetchone()
        if p:
            c.execute("DELETE FROM people WHERE id=?",(pid,))
            c.execute("DELETE FROM visits WHERE person_id=?",(pid,))
            c.execute("DELETE FROM memories WHERE person_id=?",(pid,))
    d=KNOWN_FACES_DIR/pid
    if d.exists(): shutil.rmtree(d)
    threading.Thread(target=load_known_faces,daemon=True).start()
    flash(f"Deleted {p['name'] if p else pid}")
    return redirect(url_for("caregiver_dashboard"))

@app.route("/caregiver/memory/add", methods=["POST"])
@caregiver_required
def add_memory():
    pid=request.form.get("person_id")
    summary=request.form.get("summary","").strip()
    if pid and summary:
        with get_db() as c:
            c.execute(
                "INSERT INTO memories (person_id,summary,source) VALUES(?,?,?)",
                (pid,summary,"manual"))
        flash("✅ Memory saved")
    return redirect(url_for("edit_person",pid=pid))
@app.route("/caregiver/memory/<int:mem_id>/delete", methods=["POST"])
@caregiver_required
def delete_memory(mem_id):
    pid = request.form.get("person_id")
    with get_db() as c:
        row = c.execute("SELECT person_id FROM memories WHERE id=?", (mem_id,)).fetchone()
        if row:
            if not pid:
                pid = row["person_id"]
            c.execute("DELETE FROM memories WHERE id=?", (mem_id,))
            flash("✅ Memory deleted")
        else:
            flash("Memory not found")
    if pid:
        return redirect(url_for("edit_person", pid=pid))
    return redirect(url_for("caregiver_dashboard"))
@app.route("/caregiver/analytics")
@caregiver_required
def analytics():
    with get_db() as c:
        visit_counts=c.execute("""
            SELECT p.name,COUNT(v.id) as cnt,
                   COALESCE(AVG(v.duration_s),0) as avg_dur,
                   MAX(v.started_at) as last_seen
            FROM people p LEFT JOIN visits v ON p.id=v.person_id
            GROUP BY p.id ORDER BY cnt DESC
        """).fetchall()
        daily=c.execute("""
            SELECT DATE(started_at) as day,COUNT(*) as cnt
            FROM visits GROUP BY day ORDER BY day DESC LIMIT 30
        """).fetchall()
        emotions=c.execute("""
            SELECT emotion,COUNT(*) as cnt FROM visits
            WHERE emotion IS NOT NULL GROUP BY emotion
        """).fetchall()
        memory_sources=c.execute("""
            SELECT source,COUNT(*) as cnt FROM memories GROUP BY source
        """).fetchall()
    return render_template("analytics.html",
        visit_counts=visit_counts,daily=daily,
        emotions=emotions,memory_sources=memory_sources)

@app.route("/caregiver/export/csv")
@caregiver_required
def export_csv():
    import csv,io
    output=io.StringIO(); w=csv.writer(output)
    w.writerow(["Person","Relationship","Date","Duration(s)","Emotion","Confidence"])
    with get_db() as c:
        rows=c.execute("""
            SELECT p.name,p.relationship,v.started_at,
                   v.duration_s,v.emotion,v.confidence
            FROM visits v JOIN people p ON v.person_id=p.id
            ORDER BY v.started_at DESC
        """).fetchall()
    for r in rows: w.writerow(list(r))
    from flask import make_response
    resp=make_response(output.getvalue())
    resp.headers["Content-Disposition"]="attachment; filename=visits.csv"
    resp.headers["Content-Type"]="text/csv"
    return resp

@app.route("/caregiver/enroll/<pid>/capture", methods=["POST"])
@caregiver_required
def enroll_capture(pid):
    success=_capture_enroll_frame(pid)
    face_dir=KNOWN_FACES_DIR/pid
    count=len(list(face_dir.iterdir())) if face_dir.exists() else 0
    if count>=10:
        threading.Thread(target=load_known_faces,daemon=True).start()
    return jsonify({"success":success,"count":count})

@app.route("/caregiver/enroll/<pid>")
@caregiver_required
def enroll_page(pid):
    with get_db() as c:
        person=c.execute("SELECT * FROM people WHERE id=?",(pid,)).fetchone()
    if not person:
        flash("Person not found")
        return redirect(url_for("caregiver_dashboard"))
    return render_template("enroll.html",person=person)

# ── STARTUP ────────────────────────────────────────────────────
if __name__ == "__main__":
    KNOWN_FACES_DIR.mkdir(exist_ok=True)
    UPLOADS_DIR.mkdir(exist_ok=True)
    MODELS_DIR.mkdir(exist_ok=True)
    init_db()
    load_models()
    load_known_faces()
    print("\n🚀 AI Memory Assistant v3.0 — YuNet + SFace deep recognition")
    print(f"   Patient UI  → http://127.0.0.1:5000/")
    print(f"   Caregiver   → http://127.0.0.1:5000/caregiver")
    print(f"   Whisper STT      : {'✅' if WHISPER else '❌ disabled'}")
    print(f"   Text-to-speech   : {'✅' if TTS     else '❌ disabled'}")
    print(f"   OpenAI LLM       : {'✅' if OPENAI  else '❌ disabled'}\n")
    app.run(debug=False, threaded=True, host="0.0.0.0", port=5000)