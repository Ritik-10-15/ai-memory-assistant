"""
album_api.py — family photos and patient-side reminiscence browsing.

Caregiver endpoints manage photos (upload, caption/story, date, place, who
is in them, which memory they illustrate) and each person's profile photo.
Patient endpoints are READ-ONLY and sit behind the same PIN as the patient
screen. They return what the patient may see — names, relationships,
descriptions, memory summaries, photo stories and visit dates — and never
raw transcripts, recognition scores or enrollment (biometric) photos.

Albums (albums_api.py) can be hidden from the patient. A photo is visible
to the patient unless every album it belongs to is hidden (PATIENT_VISIBLE).

Uploads are checked server-side: the file's first bytes must be JPEG, PNG
or WebP (the file name and browser-supplied type are ignored), each file is
at most MAX_FILE_BYTES, and the image must decode. Accepted images are
re-encoded, which drops EXIF metadata such as GPS location.
"""
import re
import uuid

import cv2
import numpy as np
from flask import jsonify, request, send_file, session

import config
from app_instance import app
from auth import caregiver_required, patient_required
from database import get_db

_PHOTO_ID_RE = re.compile(r"^[0-9a-f]{32}$")
MAX_SIDE = 1600          # long edge after re-encoding; plenty for a tablet
THUMB_SIDE = 480         # grid tiles and album covers
MAX_TEXT = 4000
MAX_FILE_BYTES = 15 * 1024 * 1024
MAX_FILES = 20
CATEGORIES = ("family", "celebration", "holiday", "home", "friends", "everyday")

# SQL condition (on `photos`) for photos the patient may see: in no album at
# all, or in at least one album that is shown to the patient.
PATIENT_VISIBLE = """(
    NOT EXISTS (SELECT 1 FROM album_photos ap WHERE ap.photo_id = photos.id)
    OR EXISTS (SELECT 1 FROM album_photos ap JOIN albums a ON a.id = ap.album_id
               WHERE ap.photo_id = photos.id AND a.visible_to_patient = 1))"""


def _error(message, status):
    return jsonify({"error": message}), status


def _text(data, key, limit=MAX_TEXT):
    return (data.get(key) or "").strip()[:limit]


def photo_file(photo_id, thumb=False):
    """Path of a stored family photo (or its thumbnail), or None. Ids are
    uuid4 hex, so a crafted id can never resolve outside PHOTOS_DIR.
    Thumbnails of photos uploaded before they existed are made on demand."""
    if not photo_id or not _PHOTO_ID_RE.match(photo_id):
        return None
    path = config.PHOTOS_DIR / f"{photo_id}.jpg"
    if not path.exists():
        return None
    if not thumb:
        return path
    small = config.PHOTOS_DIR / f"{photo_id}_thumb.jpg"
    if not small.exists():
        img = cv2.imread(str(path))
        if img is None:
            return path
        _write_thumb(img, small)
    return small


def delete_photo_files(photo_id):
    if photo_id and _PHOTO_ID_RE.match(photo_id):
        for name in (f"{photo_id}.jpg", f"{photo_id}_thumb.jpg"):
            (config.PHOTOS_DIR / name).unlink(missing_ok=True)


def profile_photo_file(pid):
    """The person's chosen profile photo (a family photo), if set."""
    with get_db() as c:
        row = c.execute("SELECT photo_path FROM people WHERE id=?", (pid,)).fetchone()
    return photo_file(row["photo_path"]) if row else None


def _fit(img, side):
    h, w = img.shape[:2]
    scale = side / max(h, w)
    if scale < 1:
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return img


def _write_thumb(img, path):
    cv2.imwrite(str(path), _fit(img, THUMB_SIDE), [cv2.IMWRITE_JPEG_QUALITY, 80])


def image_kind(head):
    """'jpeg' / 'png' / 'webp' from a file's first 12 bytes, else None."""
    if head[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    return None


def _store_image(upload):
    """Validate, decode, downscale and re-encode as JPEG, plus a thumbnail.
    Returns (photo_id, width, height), or a rejection reason: too_large,
    unsupported_type or invalid_image. Re-encoding drops EXIF metadata (GPS
    location, device details); OpenCV applies the EXIF orientation while
    decoding, so photos stay the right way up."""
    data = upload.read(MAX_FILE_BYTES + 1)
    if len(data) > MAX_FILE_BYTES:
        return "too_large"
    if not image_kind(data[:12]):
        return "unsupported_type"
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None or img.size == 0:
        return "invalid_image"
    img = _fit(img, MAX_SIDE)
    photo_id = uuid.uuid4().hex
    config.PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(config.PHOTOS_DIR / f"{photo_id}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    _write_thumb(img, config.PHOTOS_DIR / f"{photo_id}_thumb.jpg")
    return photo_id, img.shape[1], img.shape[0]


def _people_for(c, photo_ids):
    """{photo_id: [{id, name, relationship}]} for the given photos."""
    if not photo_ids:
        return {}
    marks = ",".join("?" * len(photo_ids))
    rows = c.execute(
        f"SELECT pp.photo_id, p.id, p.name, p.relationship FROM photo_people pp JOIN people p ON p.id=pp.person_id "
        f"WHERE pp.photo_id IN ({marks}) ORDER BY p.name COLLATE NOCASE", photo_ids).fetchall()
    out = {}
    for r in rows:
        out.setdefault(r["photo_id"], []).append(
            {"id": r["id"], "name": r["name"], "relationship": r["relationship"] or ""})
    return out


def _albums_for(c, photo_ids):
    """{photo_id: [{id, title}]} — caregiver views only (titles of hidden
    albums are not for the patient)."""
    if not photo_ids:
        return {}
    marks = ",".join("?" * len(photo_ids))
    rows = c.execute(
        f"SELECT ap.photo_id, a.id, a.title FROM album_photos ap JOIN albums a ON a.id=ap.album_id "
        f"WHERE ap.photo_id IN ({marks}) ORDER BY a.title COLLATE NOCASE", photo_ids).fetchall()
    out = {}
    for r in rows:
        out.setdefault(r["photo_id"], []).append({"id": r["id"], "title": r["title"]})
    return out


def _memories_for(c, rows):
    """{memory_id: {...}} for the memories these photos illustrate — the
    conversation highlight shown with a photo."""
    ids = sorted({r["memory_id"] for r in rows if r["memory_id"] is not None})
    if not ids:
        return {}
    marks = ",".join("?" * len(ids))
    found = c.execute(
        f"SELECT m.id, m.summary, m.created_at, p.name AS person_name FROM memories m "
        f"JOIN people p ON p.id=m.person_id WHERE m.id IN ({marks})", ids).fetchall()
    return {m["id"]: {"id": m["id"], "summary": m["summary"] or "", "person_name": m["person_name"],
                      "created_at": m["created_at"]} for m in found}


def _photo_json(row, people, memories, albums=None):
    out = {
        "id": row["id"],
        "caption": row["caption"] or "",
        "story": row["story"] or "",
        "taken_on": row["taken_on"] or "",
        "location": row["location"] or "",
        "category": row["category"] or "",
        "prompt": row["prompt"] or "",
        "width": row["width"],
        "height": row["height"],
        "memory_id": row["memory_id"],
        "memory": memories.get(row["memory_id"]),
        "created_at": row["created_at"],
        "people": people.get(row["id"], []),
    }
    if albums is not None:
        out["albums"] = albums.get(row["id"], [])
    return out


NEWEST_FIRST = "ORDER BY COALESCE(NULLIF(photos.taken_on,''), photos.created_at) DESC"


def photos_json(c, rows, caregiver=False):
    ids = [r["id"] for r in rows]
    people, memories = _people_for(c, ids), _memories_for(c, rows)
    albums = _albums_for(c, ids) if caregiver else None
    return [_photo_json(r, people, memories, albums) for r in rows]


def _load_photos(c, where="", args=(), caregiver=False):
    """Photos matching `where`, newest first. Patient views
    (caregiver=False) only ever include photos the patient may see."""
    if not caregiver:
        where = f"{where} AND {PATIENT_VISIBLE}" if where else f"WHERE {PATIENT_VISIBLE}"
    rows = c.execute(f"SELECT photos.* FROM photos {where} {NEWEST_FIRST}", args).fetchall()
    return photos_json(c, rows, caregiver)


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


def _category(value):
    value = (value or "").strip().lower()
    return value if value in CATEGORIES else ""


def patient_may_see(c, photo_id):
    return c.execute(f"SELECT 1 FROM photos WHERE id=? AND {PATIENT_VISIBLE}", (photo_id,)).fetchone() is not None


def uploads_from_request():
    """(files, error response or None) for a multipart photo upload."""
    uploads = [u for u in request.files.getlist("photos") if u and u.filename]
    if not uploads:
        return [], _error("Choose at least one photo.", 400)
    if len(uploads) > MAX_FILES:
        return [], _error(f"Upload at most {MAX_FILES} photos at a time.", 400)
    return uploads, None


def create_photos(c, uploads, form):
    """Store uploaded files as photos with the details in `form` (caption,
    story, taken_on, location, category, prompt, person_ids, memory_id).
    Returns (created ids, rejected [{filename, status}])."""
    person_ids = _valid_person_ids(c, form.getlist("person_ids"))
    memory_id = _valid_memory_id(c, form.get("memory_id"))
    created, rejected = [], []
    for up in uploads:
        stored = _store_image(up)
        if isinstance(stored, str):
            rejected.append({"filename": (up.filename or "")[:120], "status": stored})
            continue
        photo_id, width, height = stored
        c.execute("INSERT INTO photos (id, filename, caption, story, taken_on, location, category, prompt, "
                  "memory_id, width, height) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                  (photo_id, f"{photo_id}.jpg", _text(form, "caption", 200), _text(form, "story"),
                   _text(form, "taken_on", 20), _text(form, "location", 200), _category(form.get("category")),
                   _text(form, "prompt", 300), memory_id, width, height))
        c.executemany("INSERT INTO photo_people (photo_id, person_id) VALUES (?,?)",
                      [(photo_id, pid) for pid in person_ids])
        created.append(photo_id)
    return created, rejected


def delete_photo_rows(c, photo_ids):
    """Remove photos and everything pointing at them. Album membership and
    album covers follow via ON DELETE CASCADE / SET NULL."""
    for pid in photo_ids:
        c.execute("DELETE FROM photo_people WHERE photo_id=?", (pid,))
        c.execute("UPDATE people SET photo_path=NULL WHERE photo_path=?", (pid,))
        c.execute("DELETE FROM photos WHERE id=?", (pid,))


# ── Shared: the image itself ──────────────────────────────────────────
@app.route("/api/photos/<photo_id>/image")
@patient_required
def api_photo_image(photo_id):
    """?size=thumb for the small version. Patients get 404 for photos that
    are only in hidden albums; a signed-in caregiver sees everything."""
    path = photo_file(photo_id, thumb=request.args.get("size") == "thumb")
    if not path:
        return _error("Photo not found.", 404)
    if not session.get("caregiver"):
        with get_db() as c:
            if not patient_may_see(c, photo_id):
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
                (request.args["person_id"],), caregiver=True))
        return jsonify(_load_photos(c, caregiver=True))


@app.route("/api/caregiver/photos", methods=["POST"])
@caregiver_required
def api_upload_photos():
    """multipart: photos (1–20 files), caption, story, taken_on, location,
    category, prompt, person_ids (repeatable), memory_id. The same details
    apply to every uploaded file."""
    uploads, error = uploads_from_request()
    if error:
        return error
    with get_db() as c:
        created, rejected = create_photos(c, uploads, request.form)
        marks = ",".join("?" * len(created))
        photos = _load_photos(c, f"WHERE id IN ({marks})", created, caregiver=True) if created else []
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
        # Newer fields change only when sent, so older clients can't blank them.
        if "location" in data:
            c.execute("UPDATE photos SET location=? WHERE id=?", (_text(data, "location", 200), photo_id))
        if "category" in data:
            c.execute("UPDATE photos SET category=? WHERE id=?", (_category(data.get("category")), photo_id))
        if "prompt" in data:
            c.execute("UPDATE photos SET prompt=? WHERE id=?", (_text(data, "prompt", 300), photo_id))
        if "person_ids" in data:
            c.execute("DELETE FROM photo_people WHERE photo_id=?", (photo_id,))
            c.executemany("INSERT INTO photo_people (photo_id, person_id) VALUES (?,?)",
                          [(photo_id, pid) for pid in _valid_person_ids(c, data["person_ids"])])
        return jsonify(_load_photos(c, "WHERE id=?", (photo_id,), caregiver=True)[0])


@app.route("/api/caregiver/photos/<photo_id>", methods=["DELETE"])
@caregiver_required
def api_delete_photo(photo_id):
    with get_db() as c:
        if not c.execute("SELECT 1 FROM photos WHERE id=?", (photo_id,)).fetchone():
            return _error("Photo not found.", 404)
        delete_photo_rows(c, [photo_id])
    delete_photo_files(photo_id)
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
    """{memory_id: photo_id} — the first visible photo illustrating each memory."""
    if not memory_ids:
        return {}
    marks = ",".join("?" * len(memory_ids))
    rows = c.execute(f"SELECT memory_id, id FROM photos WHERE memory_id IN ({marks}) "
                     f"AND {PATIENT_VISIBLE} ORDER BY created_at", memory_ids).fetchall()
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
           (SELECT COUNT(*) FROM photo_people pp JOIN photos ON photos.id=pp.photo_id
             WHERE pp.person_id=p.id AND """ + PATIENT_VISIBLE + """) AS photo_count,
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
