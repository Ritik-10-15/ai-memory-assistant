"""
albums_api.py — named family photo albums.

An album is an ordered collection of family photos (album_photos.position).
A photo can be in several albums, or none; removing it from an album never
deletes the photo itself. Albums can be hidden from the patient — e.g. while
a caregiver is still putting one together.

Caregiver endpoints (/api/caregiver/albums...) create, edit, order and
delete. Patient endpoints (/api/albums...) are read-only, sit behind the
patient PIN, and list only albums shown to the patient.
"""
import uuid

from flask import jsonify, request

from album_api import (
    create_photos, delete_photo_files, delete_photo_rows, photos_json, uploads_from_request,
)
from app_instance import app
from auth import caregiver_required, patient_required
from database import get_db

MAX_TITLE = 120
MAX_DESCRIPTION = 2000
PAGE_DEFAULT, PAGE_MAX = 60, 200


def _error(message, status):
    return jsonify({"error": message}), status


_ALBUM_SQL = """
    SELECT a.*,
           (SELECT COUNT(*) FROM album_photos ap WHERE ap.album_id=a.id) AS photo_count,
           (SELECT ap.photo_id FROM album_photos ap WHERE ap.album_id=a.id
             ORDER BY ap.position, ap.added_at LIMIT 1) AS first_photo_id
    FROM albums a
"""


def _album_json(r, caregiver):
    out = {
        "id": r["id"],
        "title": r["title"],
        "description": r["description"] or "",
        # The chosen cover, else the first photo; null for an empty album.
        "cover_photo_id": r["cover_photo_id"] or r["first_photo_id"],
        "photo_count": r["photo_count"],
        "updated_at": r["updated_at"],
    }
    if caregiver:
        out.update(cover_chosen=r["cover_photo_id"] is not None,
                   visible_to_patient=bool(r["visible_to_patient"]), created_at=r["created_at"])
    return out


def _get_album(c, album_id, patient=False):
    where = " WHERE a.id=?" + (" AND a.visible_to_patient=1" if patient else "")
    return c.execute(_ALBUM_SQL + where, (album_id,)).fetchone()


def _album_photo_ids(c, album_id):
    return [r["photo_id"] for r in c.execute(
        "SELECT photo_id FROM album_photos WHERE album_id=? ORDER BY position, added_at", (album_id,))]


def _album_photos(c, album_id, caregiver, limit=None, offset=0):
    sql = ("SELECT photos.* FROM album_photos ap JOIN photos ON photos.id=ap.photo_id "
           "WHERE ap.album_id=? ORDER BY ap.position, ap.added_at")
    args = [album_id]
    if limit is not None:
        sql += " LIMIT ? OFFSET ?"
        args += [limit, offset]
    return photos_json(c, c.execute(sql, args).fetchall(), caregiver=caregiver)


def _page_args():
    def num(name, default, lo, hi):
        try:
            return max(lo, min(hi, int(request.args.get(name, default))))
        except (TypeError, ValueError):
            return default
    return num("limit", PAGE_DEFAULT, 1, PAGE_MAX), num("offset", 0, 0, 10 ** 9)


def _touch(c, album_id):
    c.execute("UPDATE albums SET updated_at=CURRENT_TIMESTAMP WHERE id=?", (album_id,))


def _append(c, album_id, photo_ids):
    """Add photos to the end of an album (already-present ones are skipped)."""
    start = c.execute("SELECT COALESCE(MAX(position), -1) + 1 FROM album_photos WHERE album_id=?",
                      (album_id,)).fetchone()[0]
    present = set(_album_photo_ids(c, album_id))
    added = [p for p in dict.fromkeys(photo_ids) if p not in present]
    c.executemany("INSERT INTO album_photos (album_id, photo_id, position) VALUES (?,?,?)",
                  [(album_id, pid, start + i) for i, pid in enumerate(added)])
    return added


def _detail(c, album_id):
    return {"album": _album_json(_get_album(c, album_id), caregiver=True),
            "photos": _album_photos(c, album_id, caregiver=True)}


# ── Caregiver ─────────────────────────────────────────────────────────
@app.route("/api/caregiver/albums")
@caregiver_required
def api_list_albums():
    with get_db() as c:
        rows = c.execute(_ALBUM_SQL + " ORDER BY a.updated_at DESC, a.title COLLATE NOCASE").fetchall()
    return jsonify([_album_json(r, caregiver=True) for r in rows])


@app.route("/api/caregiver/albums", methods=["POST"])
@caregiver_required
def api_create_album():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()[:MAX_TITLE]
    if not title:
        return _error("Please give the album a name.", 400)
    album_id = uuid.uuid4().hex
    with get_db() as c:
        c.execute("INSERT INTO albums (id, title, description, visible_to_patient) VALUES (?,?,?,?)",
                  (album_id, title, (data.get("description") or "").strip()[:MAX_DESCRIPTION],
                   0 if data.get("visible_to_patient") is False else 1))
        return jsonify(_detail(c, album_id)), 201


@app.route("/api/caregiver/albums/<album_id>")
@caregiver_required
def api_get_album(album_id):
    with get_db() as c:
        if not _get_album(c, album_id):
            return _error("Album not found.", 404)
        return jsonify(_detail(c, album_id))


@app.route("/api/caregiver/albums/<album_id>", methods=["PATCH"])
@caregiver_required
def api_update_album(album_id):
    """Any of: title, description, visible_to_patient, cover_photo_id
    (a photo in this album, or null for "first photo")."""
    data = request.get_json(silent=True) or {}
    with get_db() as c:
        if not _get_album(c, album_id):
            return _error("Album not found.", 404)
        if "title" in data:
            title = (data.get("title") or "").strip()[:MAX_TITLE]
            if not title:
                return _error("Please give the album a name.", 400)
            c.execute("UPDATE albums SET title=? WHERE id=?", (title, album_id))
        if "description" in data:
            c.execute("UPDATE albums SET description=? WHERE id=?",
                      ((data.get("description") or "").strip()[:MAX_DESCRIPTION], album_id))
        if "visible_to_patient" in data:
            c.execute("UPDATE albums SET visible_to_patient=? WHERE id=?",
                      (1 if data["visible_to_patient"] else 0, album_id))
        if "cover_photo_id" in data:
            cover = data["cover_photo_id"]
            if cover is not None and cover not in _album_photo_ids(c, album_id):
                return _error("The cover must be one of this album's photos.", 400)
            c.execute("UPDATE albums SET cover_photo_id=? WHERE id=?", (cover, album_id))
        _touch(c, album_id)
        return jsonify(_detail(c, album_id))


@app.route("/api/caregiver/albums/<album_id>", methods=["DELETE"])
@caregiver_required
def api_delete_album(album_id):
    """Deletes the album. Its photos stay in the photo library unless
    ?delete_photos=1, which also deletes those photos (and their files)
    that are in no other album."""
    with get_db() as c:
        if not _get_album(c, album_id):
            return _error("Album not found.", 404)
        doomed = []
        if request.args.get("delete_photos") == "1":
            doomed = [r["photo_id"] for r in c.execute(
                "SELECT photo_id FROM album_photos WHERE album_id=? AND photo_id NOT IN "
                "(SELECT photo_id FROM album_photos WHERE album_id<>?)", (album_id, album_id))]
        c.execute("DELETE FROM albums WHERE id=?", (album_id,))   # album_photos cascade
        delete_photo_rows(c, doomed)
    for pid in doomed:
        delete_photo_files(pid)
    return jsonify({"ok": True, "deleted_photos": len(doomed)})


@app.route("/api/caregiver/albums/<album_id>/photos", methods=["POST"])
@caregiver_required
def api_add_album_photos(album_id):
    """multipart upload (same fields as POST /api/caregiver/photos) of new
    photos, or JSON {photo_ids: [...]} to add photos from the library."""
    with get_db() as c:
        if not _get_album(c, album_id):
            return _error("Album not found.", 404)
        if request.is_json:
            ids = [i for i in (request.get_json(silent=True) or {}).get("photo_ids") or [] if isinstance(i, str)]
            marks = ",".join("?" * len(ids))
            known = {r["id"] for r in c.execute(f"SELECT id FROM photos WHERE id IN ({marks})", ids)} if ids else set()
            if not ids or len(known) != len(set(ids)):
                return _error("Choose photos from the library.", 400)
            _append(c, album_id, ids)
            _touch(c, album_id)
            return jsonify({**_detail(c, album_id), "rejected": []})
        uploads, error = uploads_from_request()
        if error:
            return error
        created, rejected = create_photos(c, uploads, request.form)
        _append(c, album_id, created)
        _touch(c, album_id)
        return jsonify({**_detail(c, album_id), "rejected": rejected}), 201 if created else 400


@app.route("/api/caregiver/albums/<album_id>/photos/order", methods=["PUT"])
@caregiver_required
def api_order_album_photos(album_id):
    """{photo_ids: [...]} — exactly this album's photos, in the new order."""
    ids = (request.get_json(silent=True) or {}).get("photo_ids")
    with get_db() as c:
        if not _get_album(c, album_id):
            return _error("Album not found.", 404)
        current = _album_photo_ids(c, album_id)
        if not isinstance(ids, list) or len(ids) != len(current) or set(ids) != set(current):
            return _error("The new order must list each photo in the album exactly once.", 400)
        c.executemany("UPDATE album_photos SET position=? WHERE album_id=? AND photo_id=?",
                      [(i, album_id, pid) for i, pid in enumerate(ids)])
        _touch(c, album_id)
        return jsonify(_detail(c, album_id))


@app.route("/api/caregiver/albums/<album_id>/photos/<photo_id>", methods=["DELETE"])
@caregiver_required
def api_remove_album_photo(album_id, photo_id):
    """Takes a photo out of this album; the photo stays in the library."""
    with get_db() as c:
        cur = c.execute("DELETE FROM album_photos WHERE album_id=? AND photo_id=?", (album_id, photo_id))
        if cur.rowcount == 0:
            return _error("That photo isn't in this album.", 404)
        c.execute("UPDATE albums SET cover_photo_id=NULL WHERE id=? AND cover_photo_id=?", (album_id, photo_id))
        _touch(c, album_id)
        return jsonify(_detail(c, album_id))


# ── Patient: read-only ────────────────────────────────────────────────
@app.route("/api/albums")
@patient_required
def api_patient_albums():
    with get_db() as c:
        rows = c.execute(_ALBUM_SQL + " WHERE a.visible_to_patient=1 "
                         "ORDER BY a.updated_at DESC, a.title COLLATE NOCASE").fetchall()
    return jsonify([_album_json(r, caregiver=False) for r in rows])


@app.route("/api/albums/<album_id>")
@patient_required
def api_patient_album(album_id):
    """?limit=&offset= page through the photos (default 60, max 200)."""
    limit, offset = _page_args()
    with get_db() as c:
        row = _get_album(c, album_id, patient=True)
        if not row:
            return _error("Album not found.", 404)
        return jsonify({
            "album": _album_json(row, caregiver=False),
            "photos": _album_photos(c, album_id, caregiver=False, limit=limit, offset=offset),
            "total": row["photo_count"], "limit": limit, "offset": offset,
        })
