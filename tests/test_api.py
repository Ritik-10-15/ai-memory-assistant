"""
API route tests using Flask's test client.

No server process, no camera, no models — the test client calls routes
directly in-process, so this only exercises the app logic (database
queries, auth, JSON shape), exactly what's safe and fast to run in CI.
"""
import app as app_module


def test_stats_on_empty_database(client):
    resp = client.get("/api/stats")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total_people"] == 0
    assert data["total_visits"] == 0
    assert data["total_memories"] == 0


def test_current_person_defaults_to_idle(client):
    # Force a clean idle state regardless of any leftover module state
    with app_module._det_lock:
        app_module._detection.update({
            "person_id": None, "name": None, "state": "idle", "confidence": 0.0,
        })
    resp = client.get("/api/current-person")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["state"] == "idle"
    assert data["display_message"] is None


def test_current_person_high_state_has_display_message(client):
    with app_module._det_lock:
        app_module._detection.update({
            "person_id": "p1", "name": "Ritik Gupta", "state": "high",
            "confidence": 0.87,
        })
    resp = client.get("/api/current-person")
    data = resp.get_json()
    assert data["certainty_label"] == "Recognized"
    assert "Ritik Gupta" in data["display_message"]


def test_caregiver_dashboard_requires_login(client):
    resp = client.get("/caregiver", follow_redirects=False)
    # Not logged in -> redirected to the login page, not the dashboard.
    assert resp.status_code in (301, 302)
    assert "/caregiver/login" in resp.headers.get("Location", "")


def test_caregiver_login_wrong_password_rejected(client):
    resp = client.post(
        "/caregiver/login", data={"password": "wrong"}, follow_redirects=True
    )
    assert resp.status_code == 200
    assert b"login" in resp.data.lower() or b"incorrect" in resp.data.lower()


def test_caregiver_login_correct_password_grants_access(client):
    correct = app_module.CAREGIVER_PASS
    login_resp = client.post(
        "/caregiver/login", data={"password": correct}, follow_redirects=False
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
    resp = client.post(
        "/api/save-memory",
        json={"person_id": sample_person, "summary": "Had tea together"},
    )
    assert resp.status_code == 200
    with app_module.get_db() as c:
        row = c.execute(
            "SELECT summary FROM memories WHERE person_id=?", (sample_person,)
        ).fetchone()
    assert row["summary"] == "Had tea together"