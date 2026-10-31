"""
api.py — JSON endpoints for the React frontend: session/auth, app status,
visitor photos, and the caregiver API (people, memories, visits, analytics).

Additive only: the patient endpoints in routes.py (/api/current-person,
/api/frame, /api/save-memory, ...) keep their existing contracts. Every
query here mirrors one the server-rendered caregiver pages already ran.
"""
import os
import re
import shutil
import uuid

import cv2
import numpy as np
from flask import jsonify, request, send_file, session

import config
import services
from app_instance import app
from auth import (caregiver_required, patient_required, secret_matches,
                  retry_after, record_failure, clear_failures,
                  end_caregiver_session, is_caregiver, start_caregiver_session)
from album_api import profile_photo_file
from database import get_db
from vision import (assess_enrollment_photo, gallery_counts, load_known_faces,
                    models_loaded)

_PHOTO_EXTS = {".jpg", ".jpeg", ".png"}
_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
MAX_TEXT = 4000   # generous cap on free-text fields


def _error(message, status):
    return jsonify({"error": message}), status


@app.errorhandler(413)
def _too_large(_e):
    """Requests over MAX_CONTENT_LENGTH: a JSON message, not an HTML page."""
    return _error("That upload is too large. Try fewer or smaller photos at a time.", 413)


def _reload_gallery():
    config.in_background(load_known_faces)


def _face_dir(pid):
    # Person ids are uuid4 strings; refusing anything else keeps a crafted
    # id from ever resolving outside known_faces/.
    if not _UUID_RE.match(pid or ""):
        return None
    return config.known_faces_dir() / pid


def _photo_files(pid):
    d = _face_dir(pid)
    if d is None or not d.exists():
        return []
    return sorted(f for f in d.iterdir() if f.suffix.lower() in _PHOTO_EXTS)


def _text(form, key, limit=MAX_TEXT):
    return (form.get(key) or "").strip()[:limit]


# ── SESSION / AUTH ────────────────────────────────────────────────────
@app.route("/api/session")
def api_session():
    """What the current browser is signed in as. Reveals no data."""
    if config.SANDBOX_MODE:
        signed_in = is_caregiver()
        return jsonify({"sandbox": True, "caregiver": signed_in, "patient": signed_in,
                        "patient_pin_required": False})
    return jsonify({
        "sandbox": False,
        "caregiver": is_caregiver(),
        "patient": bool(session.get("patient") or is_caregiver()
                        or not config.PATIENT_PIN),
        "patient_pin_required": bool(config.PATIENT_PIN),
    })


def _login(scope, given, expected, on_success):
    wait = retry_after(scope)
    if wait:
        resp = jsonify({"error": "Too many attempts. Please wait a few minutes and try again.",
                        "retry_after": wait})
        resp.headers["Retry-After"] = str(wait)
        return resp, 429
    if secret_matches(given, expected):
        clear_failures(scope)
        on_success()
        return jsonify({"ok": True})
    record_failure(scope)
    return _error("Incorrect. Please try again.", 401)


@app.route("/api/caregiver/login", methods=["POST"])
def api_caregiver_login():
    data = request.get_json(silent=True) or {}
    return _login("caregiver", data.get("password"), config.CAREGIVER_PASS,
                  start_caregiver_session)


@app.route("/api/caregiver/logout", methods=["POST"])
def api_caregiver_logout():
    end_caregiver_session()
    return jsonify({"ok": True})


@app.route("/api/patient/login", methods=["POST"])
def api_patient_login():
    if not config.PATIENT_PIN:
        return jsonify({"ok": True})
    data = request.get_json(silent=True) or {}

    def _grant():
        session.permanent = True
        session["patient"] = True
    return _login("patient", data.get("pin"), config.PATIENT_PIN, _grant)


# ── STATUS + PHOTOS (patient screen and caregiver) ────────────────────
@app.route("/api/status")
@patient_required
def api_status():
    counts = gallery_counts()
    return jsonify({
        "camera_mode": config.CAMERA_MODE,
        "models_loaded": models_loaded(),
        "voice_memos": bool(services.WHISPER),
        "llm_summaries": bool(services.OPENAI and os.environ.get("OPENAI_API_KEY")),
        "enrolled_people": len(counts),
        "gallery_embeddings": sum(counts.values()),
    })


@app.route("/api/people/<pid>/photo")
@patient_required
def api_person_photo(pid):
    """A person's picture for the visitor card / avatars: their chosen
    profile photo (a family photo) if set, else their first enrollment
    photo. Behind the same sign-in as the patient screen; never cached
    publicly."""
    chosen = profile_photo_file(pid) if _UUID_RE.match(pid or "") else None
    files = [chosen] if chosen else _photo_files(pid)
    if not files:
        return _error("No photo", 404)
    resp = send_file(files[0], max_age=300)
    resp.headers["Cache-Control"] = "private, max-age=300"
    return resp


# ── CAREGIVER: PEOPLE ─────────────────────────────────────────────────
_PEOPLE_SQL = """
    SELECT p.*,
           (SELECT COUNT(*) FROM memories m WHERE m.person_id=p.id) AS memory_count,
           (SELECT COUNT(*) FROM visits v WHERE v.person_id=p.id)   AS visit_count,
           (SELECT MAX(started_at) FROM visits v WHERE v.person_id=p.id) AS last_visit_at
    FROM people p
"""


def _person_json(row, counts):
    pid = row["id"]
    return {
        "id": pid,
        "name": row["name"],
        "relationship": row["relationship"] or "",
        "notes": row["notes"] or "",
        "dob": row["dob"] or "",
        "tts_greeting": row["tts_greeting"] or "",
        "created_at": row["created_at"],
        "memory_count": row["memory_count"],
        "visit_count": row["visit_count"],
        "last_visit_at": row["last_visit_at"],
        "photo_count": len(_photo_files(pid)),
        "profile_photo_id": row["photo_path"],
        "embedding_count": counts.get(pid, 0),
    }


def _load_person(pid):
    with get_db() as c:
        row = c.execute(_PEOPLE_SQL + " WHERE p.id=?", (pid,)).fetchone()
    return _person_json(row, gallery_counts()) if row else None


def _memory_json(row):
    return {
        "id": row["id"],
        "person_id": row["person_id"],
        "person_name": row["person_name"],
        "summary": row["summary"],
        "raw_transcript": row["raw_transcript"],
        "source": row["source"],
        "created_at": row["created_at"],
    }


def _visit_json(row):
    return {
        "id": row["id"],
        "person_id": row["person_id"],
        "person_name": row["person_name"],
        "relationship": row["relationship"] or "",
        "started_at": row["started_at"],
        "ended_at": row["ended_at"],
        "duration_s": row["duration_s"] or 0,
        "confidence": row["confidence"],
    }


def _save_photos(pid, uploads):
    """Validate and store uploaded photos. Each is decoded, checked for
    exactly one face, and re-encoded as JPEG (which also strips EXIF data
    such as GPS location). Returns a per-file result list."""
    face_dir = _face_dir(pid)
    face_dir.mkdir(parents=True, exist_ok=True)
    next_index = len(list(face_dir.iterdir()))
    results = []
    for up in uploads:
        if not up or not up.filename:
            continue
        name = up.filename[:120]
        img = cv2.imdecode(np.frombuffer(up.read(), np.uint8), cv2.IMREAD_COLOR)
        if img is None or img.size == 0:
            results.append({"filename": name, "status": "invalid_image"})
            continue
        status = assess_enrollment_photo(img)
        if status == "accepted":
            cv2.imwrite(str(face_dir / f"{next_index:03d}.jpg"), img)
            next_index += 1
        results.append({"filename": name, "status": status})
    return results


@app.route("/api/caregiver/people")
@caregiver_required
def api_people():
    with get_db() as c:
        rows = c.execute(_PEOPLE_SQL + " ORDER BY p.name COLLATE NOCASE").fetchall()
    counts = gallery_counts()
    return jsonify([_person_json(r, counts) for r in rows])


@app.route("/api/caregiver/people", methods=["POST"])
@caregiver_required
def api_create_person():
    name = _text(request.form, "name", 120)
    if not name:
        return _error("Name is required.", 400)
    pid = str(uuid.uuid4())
    with get_db() as c:
        c.execute(
            "INSERT INTO people (id,name,relationship,notes,dob,tts_greeting) VALUES(?,?,?,?,?,?)",
            (pid, name, _text(request.form, "relationship", 120), _text(request.form, "notes"),
             _text(request.form, "dob", 20), _text(request.form, "tts_greeting", 300)))
    photos = _save_photos(pid, request.files.getlist("photos"))
    _reload_gallery()
    return jsonify({"person": _load_person(pid), "photos": photos}), 201


@app.route("/api/caregiver/people/<pid>")
@caregiver_required
def api_person(pid):
    person = _load_person(pid)
    if not person:
        return _error("Person not found.", 404)
    with get_db() as c:
        memories = c.execute(
            "SELECT m.*, p.name AS person_name FROM memories m JOIN people p ON p.id=m.person_id "
            "WHERE m.person_id=? ORDER BY m.created_at DESC", (pid,)).fetchall()
        visits = c.execute(
            "SELECT v.*, p.name AS person_name, p.relationship FROM visits v "
            "JOIN people p ON p.id=v.person_id WHERE v.person_id=? "
            "ORDER BY v.started_at DESC LIMIT 20", (pid,)).fetchall()
    return jsonify({"person": person,
                    "memories": [_memory_json(m) for m in memories],
                    "visits": [_visit_json(v) for v in visits]})


@app.route("/api/caregiver/people/<pid>", methods=["PUT"])
@caregiver_required
def api_update_person(pid):
    if not _load_person(pid):
        return _error("Person not found.", 404)
    name = _text(request.form, "name", 120)
    if not name:
        return _error("Name is required.", 400)
    with get_db() as c:
        c.execute(
            "UPDATE people SET name=?,relationship=?,notes=?,dob=?,tts_greeting=? WHERE id=?",
            (name, _text(request.form, "relationship", 120), _text(request.form, "notes"),
             _text(request.form, "dob", 20), _text(request.form, "tts_greeting", 300), pid))
    photos = _save_photos(pid, request.files.getlist("photos"))
    _reload_gallery()
    return jsonify({"person": _load_person(pid), "photos": photos})


@app.route("/api/caregiver/people/<pid>", methods=["DELETE"])
@caregiver_required
def api_delete_person(pid):
    if not _load_person(pid):
        return _error("Person not found.", 404)
    with get_db() as c:
        # Children first: foreign keys are enforced. Photos stay, but no longer
        # illustrate this person's (deleted) memories.
        c.execute("UPDATE photos SET memory_id=NULL WHERE memory_id IN "
                  "(SELECT id FROM memories WHERE person_id=?)", (pid,))
        c.execute("DELETE FROM photo_people WHERE person_id=?", (pid,))
        c.execute("DELETE FROM memories WHERE person_id=?", (pid,))
        c.execute("DELETE FROM visits WHERE person_id=?", (pid,))
        c.execute("DELETE FROM people WHERE id=?", (pid,))
    d = _face_dir(pid)
    if d is not None and d.exists():
        shutil.rmtree(d)
    _reload_gallery()
    return jsonify({"ok": True})


# ── CAREGIVER: MEMORIES ───────────────────────────────────────────────
@app.route("/api/caregiver/memories")
@caregiver_required
def api_memories():
    sql = ("SELECT m.*, p.name AS person_name FROM memories m "
           "JOIN people p ON p.id=m.person_id")
    args = []
    if request.args.get("person_id"):
        sql += " WHERE m.person_id=?"
        args.append(request.args["person_id"])
    sql += " ORDER BY m.created_at DESC LIMIT 500"
    with get_db() as c:
        rows = c.execute(sql, args).fetchall()
    return jsonify([_memory_json(r) for r in rows])


@app.route("/api/caregiver/memories", methods=["POST"])
@caregiver_required
def api_add_memory():
    data = request.get_json(silent=True) or {}
    pid = data.get("person_id")
    summary = (data.get("summary") or "").strip()[:MAX_TEXT]
    if not summary:
        return _error("Please write the memory first.", 400)
    if not pid or not _load_person(pid):
        return _error("Person not found.", 404)
    with get_db() as c:
        cur = c.execute("INSERT INTO memories (person_id,summary,source) VALUES(?,?,?)",
                        (pid, summary, "manual"))
        row = c.execute("SELECT m.*, p.name AS person_name FROM memories m "
                        "JOIN people p ON p.id=m.person_id WHERE m.id=?",
                        (cur.lastrowid,)).fetchone()
    return jsonify(_memory_json(row)), 201


@app.route("/api/caregiver/memories/<int:mem_id>", methods=["PUT"])
@caregiver_required
def api_update_memory(mem_id):
    """Edit a memory's summary (the text the patient sees and hears).
    Only `summary` changes — the original voice-memo transcript, source,
    person and timestamp are kept as recorded."""
    data = request.get_json(silent=True) or {}
    summary = (data.get("summary") or "").strip()[:MAX_TEXT]
    if not summary:
        return _error("Please write the memory first.", 400)
    with get_db() as c:
        cur = c.execute("UPDATE memories SET summary=? WHERE id=?", (summary, mem_id))
        if cur.rowcount == 0:
            return _error("Memory not found.", 404)
        row = c.execute("SELECT m.*, p.name AS person_name FROM memories m "
                        "JOIN people p ON p.id=m.person_id WHERE m.id=?", (mem_id,)).fetchone()
    return jsonify(_memory_json(row))


@app.route("/api/caregiver/memories/<int:mem_id>", methods=["DELETE"])
@caregiver_required
def api_delete_memory(mem_id):
    with get_db() as c:
        c.execute("UPDATE photos SET memory_id=NULL WHERE memory_id=?", (mem_id,))
        cur = c.execute("DELETE FROM memories WHERE id=?", (mem_id,))
    if cur.rowcount == 0:
        return _error("Memory not found.", 404)
    return jsonify({"ok": True})


# ── CAREGIVER: VISITS + ANALYTICS ─────────────────────────────────────
@app.route("/api/caregiver/visits")
@caregiver_required
def api_visits():
    try:
        limit = max(1, min(int(request.args.get("limit", 200)), 1000))
    except ValueError:
        limit = 200
    sql = ("SELECT v.*, p.name AS person_name, p.relationship FROM visits v "
           "JOIN people p ON p.id=v.person_id")
    args = []
    if request.args.get("person_id"):
        sql += " WHERE v.person_id=?"
        args.append(request.args["person_id"])
    sql += " ORDER BY v.started_at DESC LIMIT ?"
    args.append(limit)
    with get_db() as c:
        rows = c.execute(sql, args).fetchall()
    return jsonify([_visit_json(r) for r in rows])


@app.route("/api/caregiver/analytics")
@caregiver_required
def api_analytics():
    with get_db() as c:
        per_person = c.execute("""
            SELECT p.id, p.name, COUNT(v.id) AS visits,
                   COALESCE(AVG(v.duration_s), 0) AS avg_duration_s,
                   MAX(v.started_at) AS last_seen
            FROM people p LEFT JOIN visits v ON p.id=v.person_id
            GROUP BY p.id ORDER BY visits DESC, p.name COLLATE NOCASE
        """).fetchall()
        daily = c.execute("""
            SELECT DATE(started_at) AS day, COUNT(*) AS visits
            FROM visits WHERE started_at >= DATE('now', '-29 days')
            GROUP BY day ORDER BY day
        """).fetchall()
        sources = c.execute(
            "SELECT source, COUNT(*) AS count FROM memories GROUP BY source"
        ).fetchall()
    return jsonify({
        "per_person": [{"person_id": r["id"], "name": r["name"], "visits": r["visits"],
                        "avg_duration_s": round(r["avg_duration_s"] or 0),
                        "last_seen": r["last_seen"]} for r in per_person],
        "daily": [{"day": r["day"], "visits": r["visits"]} for r in daily],
        "memory_sources": [{"source": r["source"] or "manual", "count": r["count"]} for r in sources],
    })
