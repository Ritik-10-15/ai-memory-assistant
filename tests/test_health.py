"""
Health endpoints (Phase 9). /healthz: the process serves requests.
/readyz: database and recognition are usable — public, so it must reveal
states only, never settings, paths, people or secrets.
"""
import config
import vision
import worker


def test_liveness_is_plain_and_needs_no_sign_in(client):
    r = client.get("/healthz")
    assert r.status_code == 200 and r.get_data(as_text=True) == "ok"


def test_ready_when_database_and_recognition_are_up(client, monkeypatch):
    monkeypatch.setattr(vision, "models_loaded", lambda: True)
    monkeypatch.setattr(worker, "is_running", lambda: True)
    r = client.get("/readyz")
    assert r.status_code == 200
    body = r.get_json()
    assert body["status"] == "ready"
    assert body["checks"] == {"database": "ok", "recognition": "ok"}
    assert set(body["optional"]) == {"voice_memos", "llm_summaries"}


def test_not_ready_when_recognition_is_down(client, monkeypatch):
    monkeypatch.setattr(vision, "models_loaded", lambda: True)
    monkeypatch.setattr(worker, "is_running", lambda: False)      # worker thread died
    r = client.get("/readyz")
    assert r.status_code == 503
    assert r.get_json()["checks"]["recognition"] == "unavailable"


def test_not_ready_when_the_database_is_unavailable(client, monkeypatch, tmp_path):
    monkeypatch.setattr(vision, "models_loaded", lambda: True)
    monkeypatch.setattr(worker, "is_running", lambda: True)
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "missing-dir" / "db.sqlite"))
    r = client.get("/readyz")
    assert r.status_code == 503
    assert r.get_json()["checks"]["database"] == "unavailable"


def test_readiness_reveals_no_configuration_or_data(client, sample_person, monkeypatch):
    monkeypatch.setattr(config, "PATIENT_PIN", "2468")
    text = client.get("/readyz").get_data(as_text=True)
    for secret in (config.CAREGIVER_PASS, "2468", config.SECRET_KEY, config.DB_PATH,
                   sample_person, "Test Person"):
        assert secret not in text
