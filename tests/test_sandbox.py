"""
Sandbox accounts (SANDBOX_MODE): visitors sign up for a private, temporary
copy of the app. The essential property is isolation — one visitor can never
see or change another's people, photos, memories or recognition state.
"""
import sqlite3
import time

import pytest

import accounts
import accounts_api
import app as app_module
import config
import worker

PASSWORD = "correct horse battery"


@pytest.fixture
def sandbox(temp_db, tmp_path, monkeypatch):
    monkeypatch.setattr(config, "SANDBOX_MODE", True)
    monkeypatch.setattr(config, "TENANTS_DIR", tmp_path / "tenants")
    monkeypatch.setattr(config, "ACCOUNTS_DB", str(tmp_path / "accounts.db"))
    monkeypatch.setattr(config, "SANDBOX_MAX", 50)
    accounts_api._signups.clear()
    accounts.init()
    app_module.app.config["TESTING"] = True
    yield
    for key in list(worker._states):
        if key is not None:
            worker.forget_tenant(key)


def visitor(username, password=PASSWORD, consent=True):
    c = app_module.app.test_client()
    r = c.post("/api/account/signup", json={"username": username, "password": password, "consent": consent})
    return c, r


def account_id(username):
    conn = sqlite3.connect(config.ACCOUNTS_DB)
    try:
        return conn.execute("SELECT id FROM accounts WHERE username=?", (username,)).fetchone()[0]
    finally:
        conn.close()


# ── sign-up and sign-in ──────────────────────────────────────────────
def test_signing_up_opens_a_private_copy_with_the_fictional_family(sandbox):
    c, r = visitor("robin")
    assert r.status_code == 201
    assert r.get_json()["account"]["username"] == "robin"
    people = c.get("/api/caregiver/people").get_json()
    assert sorted(p["name"] for p in people) == ["Daniel Hughes", "Margaret Ellis", "Ruth Hughes"]
    assert all(p["embedding_count"] == 0 for p in people)          # nobody is enrolled yet
    albums = c.get("/api/caregiver/albums").get_json()
    assert sorted(a["title"] for a in albums) == ["Cornwall summers", "Days with Daniel"]
    photo = albums[0]["cover_photo_id"]
    assert c.get(f"/api/photos/{photo}/image").status_code == 200
    assert c.get("/api/caregiver/visits").get_json()                # three weeks of visits
    assert c.get("/api/session").get_json() == {"sandbox": True, "caregiver": True, "patient": True,
                                                "patient_pin_required": False}


def test_passwords_are_stored_only_as_salted_hashes(sandbox):
    visitor("robin")
    stored = sqlite3.connect(config.ACCOUNTS_DB).execute("SELECT password_hash FROM accounts").fetchone()[0]
    assert PASSWORD not in stored and stored.startswith(("scrypt:", "pbkdf2:"))


@pytest.mark.parametrize("username,password,consent,message", [
    ("ab", PASSWORD, True, "username"),
    ("has space", PASSWORD, True, "username"),
    ("robin", "short", True, "password"),
    ("robin", "robin12345", False, "face photos"),
    ("robin12345", "robin12345", True, "can't be your username"),
])
def test_sign_up_explains_what_to_fix(sandbox, username, password, consent, message):
    _, r = visitor(username, password, consent)
    assert r.status_code == 400 and message in r.get_json()["error"]


def test_usernames_are_unique_regardless_of_case(sandbox):
    visitor("Robin")
    _, r = visitor("ROBIN")
    assert r.status_code == 400 and "taken" in r.get_json()["error"]


def test_sign_in_and_out(sandbox):
    visitor("robin")
    c = app_module.app.test_client()
    assert c.post("/api/account/login", json={"username": "robin", "password": "wrong password!"}).status_code == 401
    assert c.post("/api/account/login", json={"username": "ROBIN", "password": PASSWORD}).status_code == 200
    assert c.get("/api/caregiver/people").status_code == 200
    c.post("/api/account/logout")
    assert c.get("/api/caregiver/people").status_code == 401


def test_repeated_wrong_passwords_are_throttled(sandbox):
    visitor("robin")
    c = app_module.app.test_client()
    for _ in range(5):
        c.post("/api/account/login", json={"username": "robin", "password": "wrong password!"})
    r = c.post("/api/account/login", json={"username": "robin", "password": PASSWORD})
    assert r.status_code == 429


def test_new_sandboxes_are_limited_per_address_and_in_total(sandbox, monkeypatch):
    for i in range(accounts_api.SIGNUPS_PER_HOUR):
        assert visitor(f"visitor{i}")[1].status_code == 201
    assert visitor("one-too-many")[1].status_code == 429
    accounts_api._signups.clear()
    monkeypatch.setattr(config, "SANDBOX_MAX", accounts.active_count())
    _, r = visitor("demo-is-full")
    assert r.status_code == 400 and "full" in r.get_json()["error"]


# ── isolation ────────────────────────────────────────────────────────
def test_one_visitor_never_sees_anothers_data(sandbox):
    a, _ = visitor("alice")
    b, _ = visitor("bob")
    pid = a.post("/api/caregiver/people", data={"name": "Only Alice Knows"}).get_json()["person"]["id"]
    a.post("/api/caregiver/memories", json={"person_id": pid, "summary": "Alice's private memory"})
    a_photo = a.get("/api/caregiver/albums").get_json()[0]["cover_photo_id"]

    assert "Only Alice Knows" not in str(b.get("/api/caregiver/people").get_json())
    assert "Alice's private memory" not in str(b.get("/api/caregiver/memories").get_json())
    assert b.get(f"/api/caregiver/people/{pid}").status_code == 404
    assert b.get(f"/api/family/{pid}").status_code == 404
    assert b.get(f"/api/photos/{a_photo}/image").status_code == 404
    assert b.delete(f"/api/caregiver/people/{pid}").status_code == 404
    assert a.get(f"/api/caregiver/people/{pid}").status_code == 200        # still there for Alice


def test_one_visitors_camera_never_shows_up_on_anothers_screen(sandbox):
    a, _ = visitor("alice")
    b, _ = visitor("bob")
    st = worker.state(account_id("alice"))
    with st.lock:
        st.detection.update({"person_id": "p1", "name": "Alice Herself", "state": "high"})
    assert a.get("/api/current-person").get_json()["display_message"] == "This is Alice Herself"
    bob_sees = b.get("/api/current-person").get_json()
    assert bob_sees["state"] == "idle" and bob_sees["name"] is None


def test_each_sandbox_keeps_its_own_newest_frame():
    q = worker.TenantFrames()
    q.put_nowait(("a1", None, "alice"))
    q.put_nowait(("b1", None, "bob"))
    q.put_nowait(("a2", None, "alice"))          # replaces only Alice's waiting frame
    assert [q.get_nowait()[0], q.get_nowait()[0]] == ["a2", "b1"]


def test_household_sign_ins_do_not_exist_in_sandbox_mode(sandbox):
    c = app_module.app.test_client()
    assert c.post("/api/caregiver/login", json={"password": config.CAREGIVER_PASS}).status_code == 404
    assert c.post("/api/patient/login", json={"pin": "1234"}).status_code == 404
    assert c.get("/api/family").status_code == 401
    r = c.get("/")
    assert r.status_code == 302 and r.headers["Location"].startswith("/signin?next=/")


# ── deletion and expiry ──────────────────────────────────────────────
def test_deleting_a_sandbox_removes_every_file(sandbox):
    c, _ = visitor("robin")
    folder = config.tenant_root(account_id("robin"))
    assert (folder / "memory_v2.db").exists() and any((folder / "photos").iterdir())
    assert c.delete("/api/account").status_code == 200
    assert not folder.exists()
    assert c.get("/api/caregiver/people").status_code == 401
    assert app_module.app.test_client().post(
        "/api/account/login", json={"username": "robin", "password": PASSWORD}).status_code == 401


def test_expired_sandboxes_are_deleted_and_signed_out(sandbox):
    c, _ = visitor("robin")
    aid = account_id("robin")
    conn = sqlite3.connect(config.ACCOUNTS_DB)
    conn.execute("UPDATE accounts SET expires_at=?", (time.time() - 1,))
    conn.commit()
    conn.close()
    assert c.get("/api/caregiver/people").status_code == 401         # signed out at once
    assert accounts.purge_expired() == 1
    assert not config.tenant_root(aid).exists()


def test_account_endpoints_do_not_exist_for_a_household(client):
    assert client.post("/api/account/signup", json={"username": "robin", "password": PASSWORD, "consent": True}).status_code == 404
    assert client.get("/signup").status_code == 302
