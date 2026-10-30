"""
Tests for the JSON API the React frontend uses (api.py), the enrollment
capture reasons, and the stale-identity fixes in camera.py / worker.py.
Face detection is stubbed, so no model files are needed.
"""
import io

import cv2
import numpy as np
import pytest

import api
import auth
import camera
import config
import database
import worker


def _jpeg(h=120, w=160):
    ok, buf = cv2.imencode(".jpg", np.full((h, w, 3), 128, np.uint8))
    return buf.tobytes()


def _face_row(x=10, y=10, w=60, h=60):
    return np.array([x, y, w, h] + [0] * 10 + [0.9], dtype=np.float32)


@pytest.fixture
def caregiver(client):
    resp = client.post("/api/caregiver/login", json={"password": config.CAREGIVER_PASS})
    assert resp.status_code == 200
    return client


# ── auth ──────────────────────────────────────────────────────────────
def test_caregiver_api_requires_login_with_json_401(client):
    for path in ("/api/caregiver/people", "/api/caregiver/memories",
                 "/api/caregiver/visits", "/api/caregiver/analytics"):
        resp = client.get(path)
        assert resp.status_code == 401
        assert resp.get_json()["error"]


def test_session_endpoint_reflects_login(client, monkeypatch):
    monkeypatch.setattr(config, "PATIENT_PIN", "2468")
    assert client.get("/api/session").get_json() == {
        "caregiver": False, "patient": False, "patient_pin_required": True}
    client.post("/api/caregiver/login", json={"password": config.CAREGIVER_PASS})
    data = client.get("/api/session").get_json()
    assert data["caregiver"] is True and data["patient"] is True
    client.post("/api/caregiver/logout")
    assert client.get("/api/session").get_json()["caregiver"] is False


def test_wrong_password_is_rejected(client):
    resp = client.post("/api/caregiver/login", json={"password": "nope"})
    assert resp.status_code == 401
    assert client.get("/api/caregiver/people").status_code == 401


def test_login_is_throttled_after_repeated_failures(client):
    for _ in range(auth.MAX_FAILURES):
        assert client.post("/api/caregiver/login", json={"password": "x"}).status_code == 401
    # Even the right password is refused while locked out.
    resp = client.post("/api/caregiver/login", json={"password": config.CAREGIVER_PASS})
    assert resp.status_code == 429
    assert int(resp.headers["Retry-After"]) > 0


def test_patient_pin_json_login(client, monkeypatch):
    monkeypatch.setattr(config, "PATIENT_PIN", "2468")
    assert client.get("/api/status").status_code == 401
    assert client.post("/api/patient/login", json={"pin": "0000"}).status_code == 401
    assert client.post("/api/patient/login", json={"pin": "2468"}).status_code == 200
    assert client.get("/api/status").status_code == 200


def test_spa_pages_served_after_login(caregiver):
    for path in ("/caregiver", "/caregiver/people", "/caregiver/memories",
                 "/caregiver/visits", "/caregiver/settings", "/caregiver/people/add"):
        resp = caregiver.get(path)
        assert resp.status_code == 200, path
        assert b'id="root"' in resp.data


# ── people ────────────────────────────────────────────────────────────
def test_create_person_validates_each_photo(caregiver, monkeypatch):
    verdicts = iter(["accepted", "multiple_faces"])
    monkeypatch.setattr(api, "assess_enrollment_photo", lambda img: next(verdicts))
    monkeypatch.setattr(api, "_reload_gallery", lambda: None)
    resp = caregiver.post("/api/caregiver/people", data={
        "name": "Sarah Johnson", "relationship": "Daughter",
        "photos": [(io.BytesIO(_jpeg()), "good.jpg"),
                   (io.BytesIO(_jpeg()), "group.jpg"),
                   (io.BytesIO(b"not an image"), "broken.jpg")],
    }, content_type="multipart/form-data")
    assert resp.status_code == 201
    body = resp.get_json()
    assert [p["status"] for p in body["photos"]] == ["accepted", "multiple_faces", "invalid_image"]
    person = body["person"]
    assert person["name"] == "Sarah Johnson"
    assert person["photo_count"] == 1          # only the accepted photo is stored
    assert person["embedding_count"] == 0      # not embedded until the gallery reloads


def test_create_person_requires_name(caregiver):
    resp = caregiver.post("/api/caregiver/people", data={"name": "  "},
                          content_type="multipart/form-data")
    assert resp.status_code == 400


def test_update_and_list_people(caregiver, sample_person, monkeypatch):
    monkeypatch.setattr(api, "_reload_gallery", lambda: None)
    resp = caregiver.put(f"/api/caregiver/people/{sample_person}", data={
        "name": "Test Person", "relationship": "Neighbour", "notes": "Brings tea"},
        content_type="multipart/form-data")
    assert resp.status_code == 200
    people = caregiver.get("/api/caregiver/people").get_json()
    assert people[0]["relationship"] == "Neighbour"
    assert people[0]["memory_count"] == 0


def test_delete_person_removes_records(caregiver, sample_person, monkeypatch):
    monkeypatch.setattr(api, "_reload_gallery", lambda: None)
    caregiver.post("/api/caregiver/memories", json={"person_id": sample_person, "summary": "Tea"})
    assert caregiver.delete(f"/api/caregiver/people/{sample_person}").status_code == 200
    assert caregiver.get(f"/api/caregiver/people/{sample_person}").status_code == 404
    with database.get_db() as c:
        assert c.execute("SELECT COUNT(*) FROM memories").fetchone()[0] == 0


def test_legacy_delete_never_touches_folders_outside_known_faces(caregiver, monkeypatch):
    # ".." used to resolve to the data folder itself and get deleted.
    import routes
    monkeypatch.setattr(routes, "load_known_faces", lambda: None)
    config.KNOWN_FACES_DIR.mkdir(parents=True, exist_ok=True)
    sentinel = config.KNOWN_FACES_DIR.parent / "keep.txt"
    sentinel.write_text("data")
    caregiver.post("/caregiver/people/../delete")
    caregiver.post("/caregiver/people/%2E%2E/delete")
    assert sentinel.exists()


def test_person_photo_endpoint(client, sample_person):
    assert client.get(f"/api/people/{sample_person}/photo").status_code == 404
    d = config.KNOWN_FACES_DIR / sample_person
    d.mkdir(parents=True)
    (d / "000.jpg").write_bytes(_jpeg())
    resp = client.get(f"/api/people/{sample_person}/photo")
    assert resp.status_code == 200
    assert resp.headers["Cache-Control"].startswith("private")
    assert client.get("/api/people/..%2F..%2Fetc/photo").status_code == 404


# ── memories, visits, analytics ──────────────────────────────────────
def test_memories_add_list_delete(caregiver, sample_person):
    assert caregiver.post("/api/caregiver/memories",
                          json={"person_id": sample_person, "summary": ""}).status_code == 400
    created = caregiver.post("/api/caregiver/memories",
                             json={"person_id": sample_person, "summary": "Talked about the garden"})
    assert created.status_code == 201
    mem = created.get_json()
    assert mem["person_name"] == "Test Person" and mem["source"] == "manual"
    listed = caregiver.get(f"/api/caregiver/memories?person_id={sample_person}").get_json()
    assert [m["summary"] for m in listed] == ["Talked about the garden"]
    assert caregiver.delete(f"/api/caregiver/memories/{mem['id']}").status_code == 200
    assert caregiver.delete(f"/api/caregiver/memories/{mem['id']}").status_code == 404


def test_visits_and_analytics(caregiver, sample_person):
    with database.get_db() as c:
        c.execute("INSERT INTO visits (person_id, duration_s, confidence, ended_at) "
                  "VALUES (?, 120, 0.71, CURRENT_TIMESTAMP)", (sample_person,))
    visits = caregiver.get("/api/caregiver/visits").get_json()
    assert visits[0]["person_name"] == "Test Person"
    assert visits[0]["duration_s"] == 120
    stats = caregiver.get("/api/caregiver/analytics").get_json()
    assert stats["per_person"][0]["visits"] == 1
    assert stats["per_person"][0]["avg_duration_s"] == 120
    assert sum(d["visits"] for d in stats["daily"]) == 1


# ── enrollment capture reasons ────────────────────────────────────────
@pytest.mark.parametrize("faces, reason", [
    ([], "no_face"),
    ([_face_row(), _face_row(x=80)], "multiple_faces"),
])
def test_enroll_capture_explains_rejections(caregiver, sample_person, monkeypatch, faces, reason):
    monkeypatch.setattr(camera, "detect_faces", lambda img: faces)
    resp = caregiver.post(f"/caregiver/enroll/{sample_person}/capture",
                          data={"frame": (io.BytesIO(_jpeg()), "f.jpg")},
                          content_type="multipart/form-data")
    body = resp.get_json()
    assert body["success"] is False and body["reason"] == reason


def test_enroll_capture_saves_single_face(caregiver, sample_person, monkeypatch):
    monkeypatch.setattr(camera, "detect_faces", lambda img: [_face_row()])
    resp = caregiver.post(f"/caregiver/enroll/{sample_person}/capture",
                          data={"frame": (io.BytesIO(_jpeg()), "f.jpg")},
                          content_type="multipart/form-data")
    assert resp.get_json() == {"success": True, "count": 1}


def test_enroll_capture_rejects_invalid_image_and_unknown_person(caregiver, sample_person):
    bad = caregiver.post(f"/caregiver/enroll/{sample_person}/capture",
                         data={"frame": (io.BytesIO(b"junk"), "f.jpg")},
                         content_type="multipart/form-data")
    assert bad.get_json()["reason"] == "invalid_image"
    missing = caregiver.post("/caregiver/enroll/not-a-person/capture",
                             data={"frame": (io.BytesIO(_jpeg()), "f.jpg")},
                             content_type="multipart/form-data")
    assert missing.status_code == 404


# ── stale identity ────────────────────────────────────────────────────
def test_no_face_timeout_clears_every_person_field(monkeypatch):
    monkeypatch.setattr(camera, "detect_faces", lambda img: [])
    with worker.det_lock:
        worker.detection.update({
            "person_id": "p1", "name": "sarah", "state": "high", "relationship": "Daughter",
            "notes": "n", "last_memory": "m", "recent_memories": [{"summary": "m"}],
            "last_visit_at": "2026-01-01 10:00:00"})
    frame = np.zeros((48, 64, 3), np.uint8)
    for _ in range(config.NO_FACE_TIMEOUT):
        camera.process_frame(frame)
    with worker.det_lock:
        d = dict(worker.detection)
    assert d["state"] == "idle"
    for key in ("person_id", "name", "relationship", "notes", "last_memory", "last_visit_at"):
        assert d[key] is None, key
    assert d["recent_memories"] == []


def test_person_data_reports_previous_completed_visit(sample_person):
    with database.get_db() as c:
        c.execute("INSERT INTO visits (person_id, started_at, ended_at) VALUES "
                  "(?, '2026-01-01 10:00:00', '2026-01-01 10:05:00')", (sample_person,))
        # The visit in progress (no ended_at) must not count as "last time".
        c.execute("INSERT INTO visits (person_id, started_at) VALUES "
                  "(?, '2026-02-01 09:00:00')", (sample_person,))
    data = worker._get_person_data(sample_person)
    assert data["last_visit_at"] == "2026-01-01 10:00:00"


def test_memory_summary_can_be_edited_without_touching_the_transcript(caregiver, sample_person):
    with database.get_db() as c:
        cur = c.execute("INSERT INTO memories (person_id, summary, raw_transcript, source) VALUES (?,?,?,?)",
                        (sample_person, "Old summary", "the original words", "whisper"))
        mid = cur.lastrowid
    resp = caregiver.put(f"/api/caregiver/memories/{mid}", json={"summary": "  You planned the garden.  "})
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["summary"] == "You planned the garden."
    assert body["raw_transcript"] == "the original words" and body["source"] == "whisper"
    assert caregiver.put(f"/api/caregiver/memories/{mid}", json={"summary": " "}).status_code == 400
    assert caregiver.put("/api/caregiver/memories/99999", json={"summary": "x"}).status_code == 404


def test_memory_edit_requires_caregiver(client, sample_person):
    assert client.put("/api/caregiver/memories/1", json={"summary": "x"}).status_code == 401
