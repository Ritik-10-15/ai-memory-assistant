"""
Shared pytest fixtures for the modular app structure.

Every test runs against a throwaway SQLite file in a temp directory —
never the real memory_v2.db. config.DB_PATH is monkeypatched per-test.
"""
import sys
import os
import uuid
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import auth
import config
import database
import app as app_module  # composition root; importing it registers all routes


@pytest.fixture(autouse=True)
def isolated_files(tmp_path, monkeypatch):
    """Per-test face folder, a stub React build (so page routes don't
    depend on `npm run build`), and a clean login throttle."""
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text('<!doctype html><div id="root"></div>')
    monkeypatch.setattr(config, "FRONTEND_DIST", dist)
    monkeypatch.setattr(config, "KNOWN_FACES_DIR", tmp_path / "known_faces")
    monkeypatch.setattr(config, "PHOTOS_DIR", tmp_path / "photos")
    monkeypatch.setattr(config, "GALLERY_CACHE", tmp_path / "gallery_cache.npz")
    auth._failures.clear()
    yield


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    """Point config.DB_PATH at a fresh temp SQLite file and initialize schema."""
    db_file = tmp_path / "test_memory.db"
    monkeypatch.setattr(config, "DB_PATH", str(db_file))
    database.init_db()
    yield db_file


@pytest.fixture
def client(temp_db):
    """Flask test client wired to the temp database."""
    app_module.app.config["TESTING"] = True
    app_module.app.secret_key = "test-secret"
    with app_module.app.test_client() as c:
        yield c


@pytest.fixture
def sample_person(temp_db):
    """Insert one person directly into the temp DB, return their id."""
    pid = str(uuid.uuid4())
    with database.get_db() as c:
        c.execute(
            "INSERT INTO people (id,name,relationship,notes,tts_greeting) "
            "VALUES (?,?,?,?,?)",
            (pid, "Test Person", "Friend", "Some notes", "Hi there!"),
        )
    return pid