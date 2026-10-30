"""
Session lifetimes (Phase 6 audit, D7). The patient device keeps its PIN
sign-in for a long time; a caregiver's sign-in must not inherit that, and
must expire on the server after CAREGIVER_SESSION_HOURS.
"""
import time

import auth
import config


def _persistent(resp):
    """True if the session cookie set by this response outlives the browser."""
    cookies = [c for c in resp.headers.getlist("Set-Cookie") if c.startswith("session=")]
    return any("Expires=" in c or "Max-Age=" in c for c in cookies)


def test_a_caregiver_signing_in_on_the_patient_device_does_not_stay_signed_in(client, monkeypatch):
    monkeypatch.setattr(config, "PATIENT_PIN", "2468")
    assert _persistent(client.post("/api/patient/login", json={"pin": "2468"}))
    resp = client.post("/api/caregiver/login", json={"password": config.CAREGIVER_PASS})
    assert resp.status_code == 200
    assert not _persistent(resp), "caregiver sign-in must end when the browser closes"


def test_the_legacy_form_sign_in_is_not_persistent_either(client, monkeypatch):
    monkeypatch.setattr(config, "PATIENT_PIN", "2468")
    client.post("/patient/login", data={"pin": "2468"})
    resp = client.post("/caregiver/login", data={"password": config.CAREGIVER_PASS})
    assert not _persistent(resp)


def test_a_caregiver_session_expires_on_the_server(client, monkeypatch):
    assert client.post("/api/caregiver/login", json={"password": config.CAREGIVER_PASS}).status_code == 200
    assert client.get("/api/caregiver/people").status_code == 200
    real = time.time
    monkeypatch.setattr(auth.time, "time", lambda: real() + config.CAREGIVER_SESSION_HOURS * 3600 + 1)
    assert client.get("/api/caregiver/people").status_code == 401
    assert client.get("/api/session").get_json()["caregiver"] is False
    assert client.get("/api/photos/" + "a" * 32 + "/image").status_code in (401, 404)


def test_signing_out_ends_caregiver_access_but_keeps_the_patient_pin(client, monkeypatch):
    monkeypatch.setattr(config, "PATIENT_PIN", "2468")
    client.post("/api/patient/login", json={"pin": "2468"})
    client.post("/api/caregiver/login", json={"password": config.CAREGIVER_PASS})
    client.post("/api/caregiver/logout")
    assert client.get("/api/caregiver/people").status_code == 401
    assert client.get("/api/family").status_code == 200        # the patient device stays usable
