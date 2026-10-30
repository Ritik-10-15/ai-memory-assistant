"""
API route tests using Flask's test client — same behavior as before, now
pointed at worker.detection / worker.det_lock / config.CAREGIVER_PASS
since that's where this state actually lives after the refactor.
"""
import config
import worker


def test_stats_on_empty_database(client):
    resp = client.get("/api/stats")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total_people"] == 0
    assert data["total_visits"] == 0
    assert data["total_memories"] == 0


def test_current_person_defaults_to_idle(client):
    with worker.det_lock:
        worker.detection.update({
            "person_id": None, "name": None, "state": "idle", "confidence": 0.0,
        })
    resp = client.get("/api/current-person")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["state"] == "idle"
    assert data["display_message"] is None


def test_current_person_high_state_has_display_message(client):
    with worker.det_lock:
        worker.detection.update({
            "person_id": "p1", "name": "Ritik Gupta", "state": "high",
            "confidence": 0.87,
        })
    resp = client.get("/api/current-person")
    data = resp.get_json()
    assert data["certainty_label"] == "Recognized"
    assert "Ritik Gupta" in data["display_message"]


def test_caregiver_dashboard_requires_login(client):
    resp = client.get("/caregiver", follow_redirects=False)
    assert resp.status_code in (301, 302)
    assert "/caregiver/login" in resp.headers.get("Location", "")


def test_caregiver_login_wrong_password_rejected(client):
    # The form endpoint redirects back to the (React) login page with an
    # error flag, and grants no session.
    resp = client.post(
        "/caregiver/login", data={"password": "wrong"}, follow_redirects=False
    )
    assert resp.status_code in (301, 302)
    assert "/caregiver/login?error=invalid" in resp.headers.get("Location", "")
    dash = client.get("/caregiver", follow_redirects=False)
    assert "/caregiver/login" in dash.headers.get("Location", "")


def test_caregiver_login_correct_password_grants_access(client):
    login_resp = client.post(
        "/caregiver/login", data={"password": config.CAREGIVER_PASS},
        follow_redirects=False,
    )
    assert login_resp.status_code in (301, 302)

    dash_resp = client.get("/caregiver")
    assert dash_resp.status_code == 200


def test_save_memory_rejects_empty_summary(client, sample_person):
    resp = client.post(
        "/api/save-memory",
        json={"person_id": sample_person, "summary": ""},
    )
    assert resp.status_code == 400


def test_save_memory_succeeds_with_valid_data(client, sample_person):
    import database
    resp = client.post(
        "/api/save-memory",
        json={"person_id": sample_person, "summary": "Had tea together"},
    )
    assert resp.status_code == 200
    with database.get_db() as c:
        row = c.execute(
            "SELECT summary FROM memories WHERE person_id=?", (sample_person,)
        ).fetchone()
    assert row["summary"] == "Had tea together"

def test_frame_rejects_non_image(client):
    resp = client.post("/api/frame", data=b"not a jpeg",
                       content_type="image/jpeg")
    assert resp.status_code == 400


def test_frame_without_face_returns_no_box(client):
    import cv2
    import numpy as np
    ok, buf = cv2.imencode(".jpg", np.zeros((480, 640, 3), np.uint8))
    resp = client.post("/api/frame", data=buf.tobytes(),
                       content_type="image/jpeg")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["box"] is None
    assert (data["width"], data["height"]) == (640, 480)


def test_patient_screen_open_when_no_pin_configured(client, monkeypatch):
    monkeypatch.setattr(config, "PATIENT_PIN", None)
    assert client.get("/").status_code == 200
    assert client.get("/api/stats").status_code == 200


def test_patient_pin_blocks_pages_and_apis(client, monkeypatch):
    monkeypatch.setattr(config, "PATIENT_PIN", "2468")
    page = client.get("/", follow_redirects=False)
    assert page.status_code in (301, 302)
    assert "/patient/login" in page.headers.get("Location", "")
    assert client.get("/api/recent-visits").status_code == 401
    assert client.get("/api/current-person").status_code == 401


def test_patient_pin_wrong_then_right(client, monkeypatch):
    monkeypatch.setattr(config, "PATIENT_PIN", "2468")
    client.post("/patient/login", data={"pin": "0000"})
    assert client.get("/api/stats").status_code == 401
    client.post("/patient/login", data={"pin": "2468"})
    assert client.get("/api/stats").status_code == 200
    assert client.get("/").status_code == 200


def test_caregiver_session_also_opens_patient_screen(client, monkeypatch):
    monkeypatch.setattr(config, "PATIENT_PIN", "2468")
    client.post("/caregiver/login", data={"password": config.CAREGIVER_PASS})
    assert client.get("/api/stats").status_code == 200


def test_public_homepage_needs_no_sign_in(client, monkeypatch):
    monkeypatch.setattr(config, "PATIENT_PIN", "2468")
    resp = client.get("/welcome", follow_redirects=False)
    assert resp.status_code == 200
    assert b'id="root"' in resp.data
    # The patient app itself is still gated.
    assert client.get("/", follow_redirects=False).status_code in (301, 302)
