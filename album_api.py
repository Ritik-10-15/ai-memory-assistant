"""
album_api.py — family photos and patient-side reminiscence browsing.

Caregiver endpoints manage photos (upload, caption/story, date, who is in
them, which memory they illustrate) and each person's profile photo.
Patient endpoints are READ-ONLY and sit behind the same PIN as the patient
screen. They return what the patient may see — names, relationships,
descriptions, memory summaries, photo stories and visit dates — and never
raw transcripts, recognition scores or enrollment (biometric) photos.
"""
import re
import uuid

import cv2
import numpy as np
from flask import jsonify, request, send_file

import config
from app_instance import app
from auth import caregiver_required, patient_required
from database import get_db

_PHOTO_ID_RE = re.compile(r"^[0-9a-f]{32}$")
MAX_SIDE = 1600          # long edge after re-encoding; plenty for a tablet
MAX_TEXT = 4000


def _error(message, status):
    return jsonify({"error": message}), status


def _text(data, key, limit=MAX_TEXT):
    return (data.get(key) or "").strip()[:limit]


def photo_file(photo_id):
    """Path of a stored family photo, or None. Ids are uuid4 hex, so a
    crafted id can never resolve outside PHOTOS_DIR."""
    if not photo_id or not _PHOTO_ID_RE.match(photo_id):
        return None
    path = config.PHOTOS_DIR / f"{photo_id}.jpg"
    return path if path.exists() else None


def profile_photo_file(pid):
    """The person's chosen profile photo (a family photo), if set."""
    with get_db() as c:
        row = c.execute("SELECT photo_path FROM people WHERE id=?", (pid,)).fetchone()
    return photo_file(row["photo_path"]) if row else None


def _store_image(upload):
    """Decode, downscale and re-encode as JPEG. Re-encoding drops EXIF
    metadata (GPS location, device details); OpenCV applies the EXIF
    orientation while decoding, so photos stay the right way up."""
    img = cv2.imdecode(np.frombuffer(upload.read(), np.uint8), cv2.IMREAD_COLOR)
    if img is None or img.size == 0:
        return None
    h, w = img.shape[:2]
    scale = MAX_SIDE / max(h, w)
    if scale < 1:
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    photo_id = uuid.uuid4().hex
    config.PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(config.PHOTOS_DIR / f"{photo_id}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return photo_id, img.shape[1], img.shape[0]


def _people_for(c, photo_ids):
    """{photo_id: [{id, name}]} for the given photos."""
    if not photo_ids:
        return {}
    marks = ",".join("?" * len(photo_ids))
    rows = c.execute(
        f"SELECT pp.photo_id, p.id, p.name FROM photo_people pp JOIN people p ON p.id=pp.person_id "
        f"WHERE pp.photo_id IN ({marks}) ORDER BY p.name COLLATE NOCASE", photo_ids).fetchall()
    out = {}
    for r in rows:
        out.setdefault(r["photo_id"], []).append({"id": r["id"], "name": r["name"]})
    return out


def _photo_json(row, people):
    return {
        "id": row["id"],
        "caption": row["caption"] or "",
        "story": row["story"] or "",
        "taken_on": row["taken_on"] or "",
        "memory_id": row["memory_id"],
        "created_at": row["created_at"],
        "people": people.get(row["id"], []),
    }


def _load_photos(c, where="", args=()):
    rows = c.execute(f"SELECT * FROM photos {where} ORDER BY COALESCE(NULLIF(taken_on,''), created_at) DESC",
                     args).fetchall()
    people = _people_for(c, [r["id"] for r in rows])
    return [_photo_json(r, people) for r in rows]


def _valid_person_ids(c, ids):
    ids = [i for i in (ids or []) if isinstance(i, str)]
    if not ids:
        return []
    marks = ",".join("?" * len(ids))
    return [r["id"] for r in c.execute(f"SELECT id FROM people WHERE id IN ({marks})", ids).fetchall()]


def _valid_memory_id(c, value):
    try:
        mid = int(value)
    except (TypeError, ValueError):
        return None
    return mid if c.execute("SELECT 1 FROM memories WHERE id=?", (mid,)).fetchone() else None


# ── Shared: the image itself ──────────────────────────────────────────
@app.route("/api/photos/<photo_id>/image")
@patient_required
def api_photo_image(photo_id):
    path = photo_file(photo_id)
    if not path:
        return _error("Photo not found.", 404)
    resp = send_file(path, mimetype="image/jpeg", max_age=3600)
    resp.headers["Cache-Control"] = "private, max-age=3600"
    return resp


# ── Caregiver: manage photos ──────────────────────────────────────────
@app.route("/api/caregiver/photos")
@caregiver_required
def api_list_photos():
    with get_db() as c:
        if request.args.get("person_id"):
            return jsonify(_load_photos(
                c, "WHERE id IN (SELECT photo_id FROM photo_people WHERE person_id=?)",
                (request.args["person_id"],)))
        return jsonify(_load_photos(c))


@app.route("/api/caregiver/photos", methods=["POST"])
@caregiver_required
def api_upload_photos():
    """multipart: photos (1+ files), caption, story, taken_on, person_ids
    (repeatable), memory_id. The same details apply to every uploaded file."""
    uploads = [u for u in request.files.getlist("photos") if u and u.filename]
    if not uploads:
        return _error("Choose at least one photo.", 400)
    with get_db() as c:
        person_ids = _valid_person_ids(c, request.form.getlist("person_ids"))
        memory_id = _valid_memory_id(c, request.form.get("memory_id"))
        created, rejected = [], []
        for up in uploads:
            stored = _store_image(up)
            if not stored:
                rejected.append({"filename": up.filename[:120], "status": "invalid_image"})
                continue
            photo_id = stored[0]
            c.execute("INSERT INTO photos (id, filename, caption, story, taken_on, memory_id) "
                      "VALUES (?,?,?,?,?,?)",
                      (photo_id, f"{photo_id}.jpg", _text(request.form, "caption", 200),
                       _text(request.form, "story"), _text(request.form, "taken_on", 20), memory_id))
            c.executemany("INSERT INTO photo_people (photo_id, person_id) VALUES (?,?)",
                          [(photo_id, pid) for pid in person_ids])
            created.append(photo_id)
        marks = ",".join("?" * len(created))
        photos = _load_photos(c, f"WHERE id IN ({marks})", created) if created else []
    return jsonify({"photos": photos, "rejected": rejected}), 201 if created else 400


@app.route("/api/caregiver/photos/<photo_id>", methods=["PUT"])
@caregiver_required
def api_update_photo(photo_id):
    data = request.get_json(silent=True) or {}
    with get_db() as c:
        if not c.execute("SELECT 1 FROM photos WHERE id=?", (photo_id,)).fetchone():
            return _error("Photo not found.", 404)
        c.execute("UPDATE photos SET caption=?, story=?, taken_on=?, memory_id=? WHERE id=?",
                  (_text(data, "caption", 200), _text(data, "story"), _text(data, "taken_on", 20),
                   _valid_memory_id(c, data.get("memory_id")), photo_id))
        if "person_ids" in data:
            c.execute("DELETE FROM photo_people WHERE photo_id=?", (photo_id,))
            c.executemany("INSERT INTO photo_people (photo_id, person_id) VALUES (?,?)",
                          [(photo_id, pid) for pid in _valid_person_ids(c, data["person_ids"])])
        return jsonify(_load_photos(c, "WHERE id=?", (photo_id,))[0])


@app.route("/api/caregiver/photos/<photo_id>", methods=["DELETE"])
@caregiver_required
def api_delete_photo(photo_id):
    with get_db() as c:
        if not c.execute("SELECT 1 FROM photos WHERE id=?", (photo_id,)).fetchone():
            return _error("Photo not found.", 404)
        c.execute("DELETE FROM photo_people WHERE photo_id=?", (photo_id,))
        c.execute("DELETE FROM photos WHERE id=?", (photo_id,))
        c.execute("UPDATE people SET photo_path=NULL WHERE photo_path=?", (photo_id,))
    path = photo_file(photo_id)
    if path:
        path.unlink(missing_ok=True)
    return jsonify({"ok": True})


@app.route("/api/caregiver/people/<pid>/profile-photo", methods=["PUT"])
@caregiver_required
def api_set_profile_photo(pid):
    """{photo_id: "<id>"} chooses a family photo; {photo_id: null} reverts
    to the default (first enrollment photo)."""
    photo_id = (request.get_json(silent=True) or {}).get("photo_id")
    with get_db() as c:
        if not c.execute("SELECT 1 FROM people WHERE id=?", (pid,)).fetchone():
            return _error("Person not found.", 404)
        if photo_id is not None and not c.execute("SELECT 1 FROM photos WHERE id=?", (photo_id,)).fetchone():
            return _error("Photo not found.", 404)
        c.execute("UPDATE people SET photo_path=? WHERE id=?", (photo_id, pid))
    return jsonify({"ok": True, "photo_id": photo_id})


# ── Patient: read-only reminiscence ───────────────────────────────────
def _memory_photos(c, memory_ids):
    """{memory_id: photo_id} — the first photo illustrating each memory."""
    if not memory_ids:
        return {}
    marks = ",".join("?" * len(memory_ids))
    rows = c.execute(f"SELECT memory_id, id FROM photos WHERE memory_id IN ({marks}) "
                     f"ORDER BY created_at", memory_ids).fetchall()
    out = {}
    for r in rows:
        out.setdefault(r["memory_id"], r["id"])
    return out


def _patient_memories(c, where="", args=()):
    rows = c.execute(
        "SELECT m.id, m.person_id, m.summary, m.created_at, p.name AS person_name, p.relationship "
        f"FROM memories m JOIN people p ON p.id=m.person_id {where} "
        "ORDER BY m.created_at DESC LIMIT 200", args).fetchall()
    photos = _memory_photos(c, [r["id"] for r in rows])
    return [{
        "id": r["id"], "person_id": r["person_id"], "person_name": r["person_name"],
        "relationship": r["relationship"] or "", "summary": r["summary"],
        "created_at": r["created_at"], "photo_id": photos.get(r["id"]),
    } for r in rows]


_FAMILY_SQL = """
    SELECT p.id, p.name, p.relationship, p.notes, p.photo_path,
           (SELECT MAX(started_at) FROM visits v WHERE v.person_id=p.id AND v.ended_at IS NOT NULL)
               AS last_visit_at,
           (SELECT COUNT(*) FROM photo_people pp WHERE pp.person_id=p.id) AS photo_count,
           (SELECT summary FROM memories m WHERE m.person_id=p.id ORDER BY created_at DESC LIMIT 1)
               AS recent_memory,
           (SELECT created_at FROM memories m WHERE m.person_id=p.id ORDER BY created_at DESC LIMIT 1)
               AS recent_memory_at
    FROM people p
"""


def _family_json(r):
    return {
        "id": r["id"], "name": r["name"], "relationship": r["relationship"] or "",
        "description": r["notes"] or "", "last_visit_at": r["last_visit_at"],
        "photo_count": r["photo_count"],
        "recent_memory": ({"summary": r["recent_memory"], "created_at": r["recent_memory_at"]}
                          if r["recent_memory"] else None),
    }


@app.route("/api/family")
@patient_required
def api_family():
    with get_db() as c:
        rows = c.execute(_FAMILY_SQL + " ORDER BY p.name COLLATE NOCASE").fetchall()
    return jsonify([_family_json(r) for r in rows])


@app.route("/api/family/<pid>")
@patient_required
def api_family_member(pid):
    with get_db() as c:
        row = c.execute(_FAMILY_SQL + " WHERE p.id=?", (pid,)).fetchone()
        if not row:
            return _error("Person not found.", 404)
        visits = c.execute(
            "SELECT started_at FROM visits WHERE person_id=? AND ended_at IS NOT NULL "
            "ORDER BY started_at DESC LIMIT 5", (pid,)).fetchall()
        visit_count = c.execute("SELECT COUNT(*) FROM visits WHERE person_id=?", (pid,)).fetchone()[0]
        return jsonify({
            "person": _family_json(row),
            "memories": _patient_memories(c, "WHERE m.person_id=?", (pid,)),
            "photos": _load_photos(c, "WHERE id IN (SELECT photo_id FROM photo_people WHERE person_id=?)", (pid,)),
            "visits": {"count": visit_count, "recent": [v["started_at"] for v in visits]},
        })


@app.route("/api/album")
@patient_required
def api_album():
    """Everything to browse in Memories: memory cards (with their photo, if
    any) and family photos, newest first."""
    with get_db() as c:
        return jsonify({"memories": _patient_memories(c), "photos": _load_photos(c)})
