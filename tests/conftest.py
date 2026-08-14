"""
Shared pytest fixtures.

Every test runs against a throwaway SQLite file in a temp directory —
never the real memory_v2.db. app.DB_PATH is monkeypatched per-test, so
tests can never touch real enrolled people, memories, or visits.
"""
import sys
import os
import uuid
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app as app_module


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    """Point app.DB_PATH at a fresh temp SQLite file and initialize schema."""
    db_file = tmp_path / "test_memory.db"
    monkeypatch.setattr(app_module, "DB_PATH", str(db_file))
    app_module.init_db()
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
    with app_module.get_db() as c:
        c.execute(
            "INSERT INTO people (id,name,relationship,notes,tts_greeting) "
            "VALUES (?,?,?,?,?)",
            (pid, "Test Person", "Friend", "Some notes", "Hi there!"),
        )
    return pid