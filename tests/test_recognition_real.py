"""
End-to-end recognition with the REAL YuNet/SFace models: enroll a person
through the caregiver API, then send frames through the same path the
browser uses (POST /api/frame -> detection -> recognition -> identity
state) and read /api/current-person like the patient screen does.

Needs the models (python scripts/download_models.py) and a photo of one
person facing the camera, given as MEMORY_ASSISTANT_FACE_IMAGE. No face
photo ships with the repository (we don't publish people's faces), so
without one these tests are skipped.
"""
import io
import os
import queue

import cv2
import numpy as np
import pytest

import config
import vision
import worker

FACE = os.environ.get("MEMORY_ASSISTANT_FACE_IMAGE")
pytestmark = pytest.mark.skipif(
    not (FACE and os.path.exists(FACE) and config.YUNET_PATH.exists() and config.SFACE_PATH.exists()),
    reason="needs the face models and MEMORY_ASSISTANT_FACE_IMAGE",
)


def _jpeg(img):
    return cv2.imencode(".jpg", img)[1].tobytes()


@pytest.fixture
def live(client, monkeypatch):
    """Caregiver + patient session, real models, an empty gallery."""
    vision.load_models()
    monkeypatch.setattr(worker.visit_tracker, "seen", lambda *a, **k: None)
    worker.reset_state()
    assert client.post("/api/caregiver/login", json={"password": config.CAREGIVER_PASS}).status_code == 200
    vision.load_known_faces()
    yield client
    worker.reset_state()
    vision.load_known_faces()   # leave the (per-test, now empty) gallery for other tests


def _send(client, img, frames=1):
    """POST frames like the browser, then run the worker on what was queued."""
    for _ in range(frames):
        assert client.post("/api/frame", data=_jpeg(img), content_type="image/jpeg").status_code == 200
        try:
            bgr, row = worker.frame_q.get_nowait()[:2]
        except queue.Empty:
            continue
        pid, score, name = vision.recognize(bgr, row) if row is not None else (None, 0.0, None)
        worker._step(pid, score, name, row is not None)
    return client.get("/api/current-person").get_json()


def test_enroll_recognise_forget(live):
    face = cv2.imread(FACE)
    resp = live.post("/api/caregiver/people", content_type="multipart/form-data", data={
        "name": "Test Visitor", "relationship": "Friend",
        "photos": [(io.BytesIO(_jpeg(face)), "face.jpg")],
    })
    assert resp.status_code in (200, 201), resp.get_json()
    body = resp.get_json()
    assert body["photos"][0]["status"] == "accepted"
    pid = body["person"]["id"]
    live.post("/api/caregiver/memories", json={"person_id": pid, "summary": "You talked about the garden."})
    vision.load_known_faces()                                  # the app reloads in a thread

    # Known: confirmed after a few frames, with their own memory.
    d = _send(live, face, frames=4)
    assert d["state"] == "high" and d["person_id"] == pid and d["confidence"] >= config.SCORE_HIGH
    assert d["relationship"] == "Friend" and d["last_memory"] == "You talked about the garden."

    # Gone: an empty scene. Bridged briefly, then nobody.
    empty = np.full_like(face, 200)
    assert _send(live, empty, frames=2)["person_id"] == pid
    d = _send(live, empty, frames=config.STICKY_FRAMES + 2)
    assert d["state"] == "idle" and d["person_id"] is None and d["last_memory"] is None

    # Deleted: the same face is now a stranger (open-set rejection).
    assert live.delete(f"/api/caregiver/people/{pid}").status_code == 200
    vision.load_known_faces()
    d = _send(live, face, frames=config.UNKNOWN_GRACE_FRAMES + 2)
    assert d["state"] in ("unknown", "idle") and d["person_id"] is None and d["name"] is None


def test_a_frame_that_is_not_an_image_is_refused(live):
    assert live.post("/api/frame", data=b"not a jpeg", content_type="image/jpeg").status_code == 400
