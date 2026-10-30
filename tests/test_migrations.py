"""
Tests for migrations.py: upgrading a database created before photo albums
existed keeps every record, can be rolled back, and foreign keys are
enforced without breaking the existing delete flows.
"""
import sqlite3
import uuid

import pytest

import config
import database
import migrations

# The schema exactly as it was before Phase 5 (schema version 0).
V0_SCHEMA = """
CREATE TABLE people (id TEXT PRIMARY KEY, name TEXT NOT NULL, relationship TEXT, notes TEXT, dob TEXT,
    photo_path TEXT, tts_greeting TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE visits (id INTEGER PRIMARY KEY AUTOINCREMENT, person_id TEXT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP, ended_at DATETIME, duration_s INTEGER DEFAULT 0,
    emotion TEXT, confidence REAL, FOREIGN KEY(person_id) REFERENCES people(id));
CREATE TABLE memories (id INTEGER PRIMARY KEY AUTOINCREMENT, person_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, summary TEXT, raw_transcript TEXT, source TEXT DEFAULT 'manual',
    FOREIGN KEY(person_id) REFERENCES people(id));
CREATE TABLE alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, message TEXT, seen INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE photos (id TEXT PRIMARY KEY, filename TEXT NOT NULL, caption TEXT, story TEXT, taken_on TEXT,
    memory_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(memory_id) REFERENCES memories(id));
CREATE TABLE photo_people (photo_id TEXT NOT NULL, person_id TEXT NOT NULL, PRIMARY KEY (photo_id, person_id),
    FOREIGN KEY(photo_id) REFERENCES photos(id), FOREIGN KEY(person_id) REFERENCES people(id));
"""
PID, PHOTO = "11111111-1111-4111-8111-111111111111", "a" * 32


@pytest.fixture
def old_db(tmp_path, monkeypatch):
    path = tmp_path / "memory_v2.db"
    conn = sqlite3.connect(path)
    conn.executescript(V0_SCHEMA)
    conn.execute("INSERT INTO people (id, name, relationship, photo_path) VALUES (?, 'Sarah', 'Daughter', ?)",
                 (PID, PHOTO))
    conn.execute("INSERT INTO visits (person_id, confidence, ended_at, duration_s) VALUES (?, 0.7, '2026-10-01', 60)",
                 (PID,))
    conn.execute("INSERT INTO memories (id, person_id, summary) VALUES (5, ?, 'The garden')", (PID,))
    conn.execute("INSERT INTO photos (id, filename, caption, story, memory_id) VALUES (?, ?, 'Beach', 'Sandcastle', 5)",
                 (PHOTO, f"{PHOTO}.jpg"))
    conn.execute("INSERT INTO photo_people VALUES (?, ?)", (PHOTO, PID))
    conn.commit()
    conn.close()
    monkeypatch.setattr(config, "DB_PATH", str(path))
    return path


def _snapshot(path):
    conn = sqlite3.connect(path)
    try:
        return {t: conn.execute(f"SELECT {cols} FROM {t} ORDER BY 1").fetchall() for t, cols in {
            "people": "id, name, relationship, photo_path", "visits": "id, person_id, duration_s",
            "memories": "id, person_id, summary", "photos": "id, caption, story, memory_id",
            "photo_people": "photo_id, person_id"}.items()}
    finally:
        conn.close()


def test_upgrade_keeps_every_existing_record_and_backs_up_first(old_db):
    before = _snapshot(old_db)
    database.init_db()
    assert migrations.current_version(str(old_db)) == migrations.LATEST
    assert _snapshot(old_db) == before
    backup = old_db.parent / "memory_v2.db.bak-v0"
    assert backup.exists() and _snapshot(backup) == before
    with database.get_db() as c:
        cols = {r[1] for r in c.execute("PRAGMA table_info(photos)")}
        assert {"location", "category", "prompt", "width", "height"} <= cols
        row = c.execute("SELECT location, category, prompt FROM photos").fetchone()
        assert tuple(row) == ("", "", "")
        tables = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert {"albums", "album_photos"} <= tables
        assert c.execute("PRAGMA foreign_key_check").fetchall() == []


def test_upgrade_is_idempotent_and_needs_no_second_backup(old_db):
    database.init_db()
    (old_db.parent / "memory_v2.db.bak-v0").unlink()
    database.init_db()
    assert not (old_db.parent / "memory_v2.db.bak-v0").exists()
    assert migrations.current_version(str(old_db)) == migrations.LATEST


def test_rollback_removes_only_what_the_migration_added(old_db):
    before = _snapshot(old_db)
    database.init_db()
    with database.get_db() as c:
        c.execute("INSERT INTO albums (id, title) VALUES ('x', 'Holiday')")
    migrations.downgrade(str(old_db), 0)
    assert migrations.current_version(str(old_db)) == 0
    assert _snapshot(old_db) == before
    conn = sqlite3.connect(old_db)
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    cols = {r[1] for r in conn.execute("PRAGMA table_info(photos)")}
    conn.close()
    assert "albums" not in tables and "album_photos" not in tables and "location" not in cols
    migrations.upgrade(str(old_db), make_backup=False)                 # and forward again
    assert migrations.current_version(str(old_db)) == migrations.LATEST


def test_a_failed_migration_leaves_the_database_unchanged(old_db, monkeypatch):
    def broken(conn):
        conn.execute("CREATE TABLE albums (id TEXT)")
        raise RuntimeError("disk full")
    monkeypatch.setitem(migrations.MIGRATIONS, 1, (broken, migrations._down_1))
    with pytest.raises(RuntimeError):
        migrations.upgrade(str(old_db), make_backup=False)
    conn = sqlite3.connect(old_db)
    assert conn.execute("PRAGMA user_version").fetchone()[0] == 0
    assert not conn.execute("SELECT 1 FROM sqlite_master WHERE name='albums'").fetchone()
    conn.close()


def test_a_fresh_install_is_not_backed_up(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "new.db"))
    database.init_db()
    assert migrations.current_version() == migrations.LATEST
    assert not list(tmp_path.glob("*.bak-*"))


# ── foreign keys are enforced, and existing flows still work ──────────
def test_foreign_keys_are_enforced(temp_db):
    with database.get_db() as c:
        assert c.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        with pytest.raises(sqlite3.IntegrityError):
            c.execute("INSERT INTO photo_people VALUES ('nope', 'nobody')")


def test_deleting_a_person_or_memory_linked_to_a_photo_still_works(client, sample_person):
    client.post("/api/caregiver/login", json={"password": config.CAREGIVER_PASS})
    photo = uuid.uuid4().hex
    with database.get_db() as c:
        m1 = c.execute("INSERT INTO memories (person_id, summary) VALUES (?, 'one')", (sample_person,)).lastrowid
        c.execute("INSERT INTO photos (id, filename, memory_id) VALUES (?, 'x.jpg', ?)", (photo, m1))
        c.execute("INSERT INTO visits (person_id) VALUES (?)", (sample_person,))
    assert client.delete(f"/api/caregiver/memories/{m1}").status_code == 200
    with database.get_db() as c:
        m2 = c.execute("INSERT INTO memories (person_id, summary) VALUES (?, 'two')", (sample_person,)).lastrowid
        c.execute("UPDATE photos SET memory_id=? WHERE id=?", (m2, photo))
        c.execute("INSERT INTO photo_people VALUES (?, ?)", (photo, sample_person))
    assert client.delete(f"/api/caregiver/people/{sample_person}").status_code == 200
    with database.get_db() as c:
        assert c.execute("SELECT memory_id FROM photos WHERE id=?", (photo,)).fetchone()[0] is None
        assert c.execute("SELECT COUNT(*) FROM visits").fetchone()[0] == 0


def test_a_visit_for_a_just_deleted_person_is_skipped_not_crashed(temp_db, monkeypatch):
    import vision
    monkeypatch.setattr(vision, "speak_greeting", lambda pid: None)
    tracker = vision.VisitTracker()
    tracker.seen("deleted-moments-ago", 0.8)                            # still in the in-memory gallery
    assert tracker._visit_id is None
    with database.get_db() as c:
        assert c.execute("SELECT COUNT(*) FROM visits").fetchone()[0] == 0


def test_a_database_from_before_family_photos_also_upgrades(tmp_path, monkeypatch):
    """The oldest installs have no photos/photo_people tables at all."""
    path = tmp_path / "oldest.db"
    conn = sqlite3.connect(path)
    conn.executescript(V0_SCHEMA.split("CREATE TABLE photos")[0])
    conn.execute("INSERT INTO people (id, name) VALUES (?, 'Sarah')", (PID,))
    conn.commit()
    conn.close()
    monkeypatch.setattr(config, "DB_PATH", str(path))
    database.init_db()
    assert migrations.current_version() == migrations.LATEST
    with database.get_db() as c:
        assert c.execute("SELECT name FROM people").fetchone()[0] == "Sarah"


def test_demo_data_can_be_added_to_an_album_and_removed_again(client):
    """scripts/seed_demo.py --remove with foreign keys enforced (its photos
    illustrate its memories, and may have been put in an album)."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("seed_demo", "scripts/seed_demo.py")
    seed_demo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(seed_demo)
    seed_demo.seed()
    with database.get_db() as c:
        photo = c.execute("SELECT id FROM photos WHERE memory_id IS NOT NULL").fetchone()["id"]
        c.execute("INSERT INTO albums (id, title) VALUES ('d', 'Demo album')")
        c.execute("INSERT INTO album_photos (album_id, photo_id) VALUES ('d', ?)", (photo,))
    seed_demo.remove()
    with database.get_db() as c:
        assert c.execute("SELECT COUNT(*) FROM people").fetchone()[0] == 0
        assert c.execute("SELECT COUNT(*) FROM photos").fetchone()[0] == 0
        assert c.execute("SELECT COUNT(*) FROM album_photos").fetchone()[0] == 0
    assert not list(config.PHOTOS_DIR.glob("*.jpg"))


def test_per_person_lookups_use_an_index(temp_db):
    """Migration 2: people lists and recognition look up a person's visits
    and memories by person_id; that must not scan the whole table."""
    with database.get_db() as c:
        for sql in ("SELECT MAX(started_at) FROM visits WHERE person_id='x'",
                    "SELECT COUNT(*) FROM visits WHERE person_id='x'",
                    "SELECT summary FROM memories WHERE person_id='x' ORDER BY created_at DESC LIMIT 3"):
            plan = " ".join(r[-1] for r in c.execute("EXPLAIN QUERY PLAN " + sql))
            assert "USING" in plan and "INDEX" in plan, (sql, plan)


def test_visit_history_and_analytics_read_an_index(temp_db):
    """Migration 3: listing every visit newest first must walk an index, not
    sort the table; per-person analytics must not touch the table at all."""
    with database.get_db() as c:
        def plan(sql):
            return " | ".join(r[-1] for r in c.execute("EXPLAIN QUERY PLAN " + sql))
        history = plan("SELECT v.*, p.name FROM visits v JOIN people p ON p.id=v.person_id "
                       "ORDER BY v.started_at DESC LIMIT 200")
        assert "idx_visits_started" in history and "TEMP B-TREE" not in history, history
        per_person = plan("SELECT p.id, COUNT(v.id), AVG(v.duration_s), MAX(v.started_at) "
                          "FROM people p LEFT JOIN visits v ON p.id=v.person_id GROUP BY p.id")
        assert "COVERING INDEX idx_visits_person" in per_person, per_person

