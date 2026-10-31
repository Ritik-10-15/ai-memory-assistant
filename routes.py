"""
routes.py — every HTTP route: patient-facing API + video, and the
password-protected caregiver panel.

No recognition or database logic lives here — routes call into vision.py,
worker.py, camera.py, services.py, and database.py, and translate the
result into HTTP responses. That's the whole job of this layer.

Pages (GET) are served by the React app in frontend/dist; the form-POST
endpoints below are kept so existing scripts and bookmarks keep working.
The JSON API the React caregiver dashboard uses lives in api.py.
"""
import os
import shutil
import uuid
from pathlib import Path

from flask import (Response, jsonify, request, redirect, url_for, session,
                   flash, make_response, send_from_directory)

import config
from app_instance import app
from auth import (caregiver_required, patient_required, secret_matches,
                  start_caregiver_session, end_caregiver_session,
                  retry_after, record_failure, clear_failures)
from database import get_db
import services
from services import auto_log
from vision import load_known_faces
from worker import state as recognition_state
from camera import generate_frames, capture_enroll_frame, process_frame, decode_jpeg


# ── REACT FRONTEND ────────────────────────────────────────────────────
def spa():
    """The single-page app shell. Routing happens client-side."""
    index_file = config.FRONTEND_DIST / "index.html"
    if not index_file.exists():
        return ("Frontend not built. Run `npm install && npm run build` in "
                "frontend/, or use `npm run dev` during development.", 503)
    resp = send_from_directory(config.FRONTEND_DIST, "index.html")
    resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.route("/assets/<path:filename>")
def frontend_assets(filename):
    # Vite fingerprints asset names, so they can be cached for a long time.
    resp = send_from_directory(config.FRONTEND_DIST / "assets", filename)
    resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return resp


@app.route("/favicon.svg")
def favicon():
    return send_from_directory(config.FRONTEND_DIST, "favicon.svg")


@app.route("/healthz")
def healthz():
    """Liveness: the process is up and serving requests. Nothing else."""
    return "ok"


@app.route("/readyz")
def readyz():
    """Readiness, for deploy verification and monitoring: can this instance
    do its job? Public, so it reports states only: no paths, counts, names
    or settings. 503 when a required part is down; optional features being
    off is not a failure."""
    import migrations
    import vision
    import worker as recognition_worker
    try:
        with get_db() as c:
            c.execute("SELECT 1").fetchone()
        db = "ok" if migrations.current_version() == migrations.LATEST else "needs migration"
    except Exception:
        db = "unavailable"
    recognition = "ok" if vision.models_loaded() and recognition_worker.is_running() else "unavailable"
    if config.CAMERA_MODE == "browser":
        camera = "patient device"
    else:
        from camera import _camera
        camera = "ok" if _camera is not None and _camera.isOpened() else "not available"
    ready = db == "ok" and recognition == "ok"
    return jsonify({
        "status": "ready" if ready else "not ready",
        "version": config.APP_VERSION,
        "checks": {"database": db, "recognition": recognition},
        "camera": camera,
        "optional": {"voice_memos": bool(services.WHISPER),
                     "llm_summaries": bool(services.OPENAI and os.environ.get("OPENAI_API_KEY"))},
    }), 200 if ready else 503


@app.route("/signin")
@app.route("/signup")
def account_pages():
    """Sandbox sign-in and sign-up (SANDBOX_MODE); the household signs in
    with the caregiver password instead."""
    if not config.SANDBOX_MODE:
        return redirect(url_for("caregiver_login"))
    return spa()


@app.route("/welcome")
def welcome():
    """Public homepage. Shows only fictional, simulated demo content — no
    patient data — so it needs no sign-in."""
    return spa()


# ── PATIENT ROUTES ────────────────────────────────────────────────────
@app.route("/patient/login", methods=["GET", "POST"])
def patient_login():
    if config.SANDBOX_MODE:
        return redirect("/signin")
    if not config.PATIENT_PIN:
        return redirect(url_for("index"))
    if request.method == "POST":
        if retry_after("patient"):
            return redirect(url_for("patient_login", error="locked"))
        if secret_matches(request.form.get("pin"), config.PATIENT_PIN):
            clear_failures("patient")
            session.permanent = True
            session["patient"] = True
            return redirect(url_for("index"))
        record_failure("patient")
        return redirect(url_for("patient_login", error="invalid"))
    return spa()


@app.route("/")
@app.route("/family")
@app.route("/family/<path:_sub>")
@app.route("/memories")
@app.route("/albums")
@app.route("/albums/<path:_sub>")
@patient_required
def index(_sub=None):
    """Patient app pages (Home, Family, Albums, Memories) — routed client-side."""
    return spa()


@app.route("/video")
@patient_required
def video():
    return Response(generate_frames(), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.route("/api/frame", methods=["POST"])
@patient_required
def api_frame():
    """Browser-camera mode: one JPEG frame in, the detected face box out.
    Recognition itself still happens on the worker thread; the page reads
    the result from /api/current-person as usual."""
    frame = decode_jpeg(request.get_data())
    if frame is None:
        return jsonify({"error": "Invalid image"}), 400
    row = process_frame(frame)
    h, w = frame.shape[:2]
    box = [int(v) for v in row[:4]] if row is not None else None
    return jsonify({"box": box, "width": w, "height": h})


@app.route("/api/current-person")
@patient_required
def api_current_person():
    st = recognition_state()
    with st.lock:
        d = dict(st.detection)
    state = d["state"]; name = d.get("name", "")
    if state == "high" and name:
        d["display_message"] = f"This is {name.title()}"
        d["certainty_label"] = "Recognized"
        d["certainty_class"] = "high"
    elif state == "medium" and name:
        d["display_message"] = f"This might be {name.title()}"
        d["certainty_label"] = "Not sure"
        d["certainty_class"] = "medium"
    elif state == "unknown":
        d["display_message"] = "I don't recognize this person"
        d["certainty_label"] = "Unknown"
        d["certainty_class"] = "unknown"
    else:
        d["display_message"] = d["certainty_label"] = d["certainty_class"] = None
    return jsonify(d)


@app.route("/api/save-memory", methods=["POST"])
@patient_required
def api_save_memory():
    data = request.json or {}
    summary = data.get("summary", "").strip()
    pid = data.get("person_id")
    if not summary:
        return jsonify({"error": "Empty summary"}), 400
    with get_db() as c:
        if not pid:
            st = recognition_state()
            with st.lock:
                name = st.detection.get("name", "")
            if name:
                row = c.execute(
                    "SELECT id FROM people WHERE LOWER(name)=LOWER(?)", (name,)
                ).fetchone()
                pid = row["id"] if row else None
        if not pid:
            return jsonify({"error": "No person detected"}), 404
        c.execute(
            "INSERT INTO memories (person_id,summary,source) VALUES(?,?,?)",
            (pid, summary, "manual"))
    return jsonify({"message": "Memory saved ✓"})


@app.route("/api/recent-visits")
@patient_required
def api_recent_visits():
    with get_db() as c:
        rows = c.execute("""
            SELECT v.*,p.name,p.relationship FROM visits v
            JOIN people p ON v.person_id=p.id
            ORDER BY v.started_at DESC LIMIT 15
        """).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/upload-audio", methods=["POST"])
@patient_required
def api_upload_audio():
    if not services.WHISPER:      # read now: it turns False if Whisper fails to load
        return jsonify({"error": "Whisper not available"}), 503
    pid = request.form.get("person_id")
    audio = request.files.get("audio")
    if not pid or not audio:
        return jsonify({"error": "Missing data"}), 400
    path = config.uploads_dir() / f"{uuid.uuid4()}.webm"
    audio.save(str(path))
    config.in_background(auto_log, pid, str(path))
    return jsonify({"message": "Transcribing in background..."})


@app.route("/api/stats")
@patient_required
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


# ── CAREGIVER ROUTES ──────────────────────────────────────────────────
@app.route("/caregiver/login", methods=["GET", "POST"])
def caregiver_login():
    if config.SANDBOX_MODE:
        return redirect("/signin")
    if request.method == "POST":
        if retry_after("caregiver"):
            return redirect(url_for("caregiver_login", error="locked"))
        if secret_matches(request.form.get("password"), config.CAREGIVER_PASS):
            clear_failures("caregiver")
            start_caregiver_session()
            return redirect(url_for("caregiver_dashboard"))
        record_failure("caregiver")
        return redirect(url_for("caregiver_login", error="invalid"))
    return spa()


@app.route("/caregiver/logout")
def caregiver_logout():
    end_caregiver_session()
    return redirect(url_for("index"))


@app.route("/caregiver")
@caregiver_required
def caregiver_dashboard():
    return spa()


@app.route("/caregiver/<path:_subpage>")
@caregiver_required
def caregiver_pages(_subpage):
    """Client-side caregiver routes (people, memories, visits, settings).
    More specific rules — the login page and the form-POST endpoints —
    take precedence over this catch-all."""
    return spa()


@app.route("/caregiver/people/add", methods=["GET", "POST"])
@caregiver_required
def add_person():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        if not name:
            flash("Name is required")
            return redirect(url_for("add_person"))
        pid = str(uuid.uuid4())
        face_dir = config.known_faces_dir() / pid
        face_dir.mkdir(parents=True, exist_ok=True)
        photos = request.files.getlist("photos"); saved = 0
        for photo in photos:
            if photo and photo.filename:
                ext = Path(photo.filename).suffix.lower()
                photo.save(str(face_dir / f"{saved:03d}{ext}"))
                saved += 1
        with get_db() as c:
            c.execute(
                "INSERT INTO people (id,name,relationship,notes,dob,tts_greeting) VALUES(?,?,?,?,?,?)",
                (pid, name, request.form.get("relationship", ""),
                 request.form.get("notes", ""), request.form.get("dob", ""),
                 request.form.get("tts_greeting", "")))
        config.in_background(load_known_faces)
        flash(f"✅ Added {name} with {saved} photo(s)")
        return redirect(url_for("caregiver_dashboard"))
    return spa()


@app.route("/caregiver/people/<pid>/edit", methods=["GET", "POST"])
@caregiver_required
def edit_person(pid):
    if request.method == "GET":
        return spa()   # the React page loads the person via the JSON API
    with get_db() as c:
        person = c.execute("SELECT * FROM people WHERE id=?", (pid,)).fetchone()
    if not person:
        flash("Not found")
        return redirect(url_for("caregiver_dashboard"))
    if request.method == "POST":
        with get_db() as c:
            c.execute(
                "UPDATE people SET name=?,relationship=?,notes=?,dob=?,tts_greeting=? WHERE id=?",
                (request.form.get("name"), request.form.get("relationship"),
                 request.form.get("notes"), request.form.get("dob"),
                 request.form.get("tts_greeting"), pid))
        photos = request.files.getlist("photos")
        face_dir = config.known_faces_dir() / pid
        face_dir.mkdir(exist_ok=True)
        existing = len(list(face_dir.iterdir())); saved = 0
        for i, photo in enumerate(photos):
            if photo and photo.filename:
                ext = Path(photo.filename).suffix.lower()
                photo.save(str(face_dir / f"{existing + i:03d}{ext}"))
                saved += 1
        config.in_background(load_known_faces)
        flash(f"✅ Updated — {saved} new photo(s) added")
        return redirect(url_for("caregiver_dashboard"))


@app.route("/caregiver/people/<pid>/delete", methods=["POST"])
@caregiver_required
def delete_person(pid):
    with get_db() as c:
        p = c.execute("SELECT name FROM people WHERE id=?", (pid,)).fetchone()
        if p:
            # Children first: foreign keys are enforced. Photos stay, but no longer
            # illustrate this person's (deleted) memories.
            c.execute("UPDATE photos SET memory_id=NULL WHERE memory_id IN "
                      "(SELECT id FROM memories WHERE person_id=?)", (pid,))
            c.execute("DELETE FROM photo_people WHERE person_id=?", (pid,))
            c.execute("DELETE FROM memories WHERE person_id=?", (pid,))
            c.execute("DELETE FROM visits WHERE person_id=?", (pid,))
            c.execute("DELETE FROM people WHERE id=?", (pid,))
    # Only remove a folder that belongs to a real person: an arbitrary id
    # such as ".." would otherwise point outside known_faces/.
    d = config.known_faces_dir() / pid
    if p and d.exists():
        shutil.rmtree(d)
    config.in_background(load_known_faces)
    flash(f"Deleted {p['name'] if p else pid}")
    return redirect(url_for("caregiver_dashboard"))


@app.route("/caregiver/memory/add", methods=["POST"])
@caregiver_required
def add_memory():
    pid = request.form.get("person_id")
    summary = request.form.get("summary", "").strip()
    if pid and summary:
        with get_db() as c:
            c.execute(
                "INSERT INTO memories (person_id,summary,source) VALUES(?,?,?)",
                (pid, summary, "manual"))
        flash("✅ Memory saved")
    return redirect(url_for("edit_person", pid=pid))


@app.route("/caregiver/memory/<int:mem_id>/delete", methods=["POST"])
@caregiver_required
def delete_memory(mem_id):
    pid = request.form.get("person_id")
    with get_db() as c:
        row = c.execute("SELECT person_id FROM memories WHERE id=?", (mem_id,)).fetchone()
        if row:
            if not pid:
                pid = row["person_id"]
            c.execute("UPDATE photos SET memory_id=NULL WHERE memory_id=?", (mem_id,))
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
    return spa()


@app.route("/caregiver/export/csv")
@caregiver_required
def export_csv():
    import csv, io
    output = io.StringIO(); w = csv.writer(output)
    w.writerow(["Person", "Relationship", "Date", "Duration(s)", "Emotion", "Confidence"])
    with get_db() as c:
        rows = c.execute("""
            SELECT p.name,p.relationship,v.started_at,
                   v.duration_s,v.emotion,v.confidence
            FROM visits v JOIN people p ON v.person_id=p.id
            ORDER BY v.started_at DESC
        """).fetchall()
    for r in rows:
        w.writerow(list(r))
    resp = make_response(output.getvalue())
    resp.headers["Content-Disposition"] = "attachment; filename=visits.csv"
    resp.headers["Content-Type"] = "text/csv"
    return resp


@app.route("/caregiver/enroll/<pid>/capture", methods=["POST"])
@caregiver_required
def enroll_capture(pid):
    """Returns {success, count} as before, plus `reason` when a frame is
    rejected: no_face, multiple_faces, invalid_image or camera_unavailable."""
    with get_db() as c:
        if not c.execute("SELECT 1 FROM people WHERE id=?", (pid,)).fetchone():
            return jsonify({"success": False, "count": 0, "reason": "unknown_person"}), 404
    upload = request.files.get("frame")
    if upload:
        frame = decode_jpeg(upload.read())
        if frame is None:
            success, reason = False, "invalid_image"
        else:
            success, reason = capture_enroll_frame(pid, frame)
    else:
        success, reason = capture_enroll_frame(pid)
    face_dir = config.known_faces_dir() / pid
    count = len(list(face_dir.iterdir())) if face_dir.exists() else 0
    if success and count >= 10:
        config.in_background(load_known_faces)
    body = {"success": success, "count": count}
    if reason:
        body["reason"] = reason
    return jsonify(body)


@app.route("/caregiver/enroll/<pid>")
@caregiver_required
def enroll_page(pid):
    return spa()