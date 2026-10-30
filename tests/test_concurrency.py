"""
Concurrent database use, as in production: one process, many threads (the
recognition worker recording visits while caregivers and the patient
device write through the API). Nothing may fail with "database is locked"
and no write may be lost.
"""
import threading
import uuid

import app as app_module
import config
import database
import vision


def test_concurrent_writers_do_not_lock_or_lose_writes(client, sample_person):
    client.post("/api/caregiver/login", json={"password": config.CAREGIVER_PASS})
    others = [str(uuid.uuid4()) for _ in range(4)]
    with database.get_db() as c:
        c.executemany("INSERT INTO people (id, name) VALUES (?, ?)", [(p, f"P{i}") for i, p in enumerate(others)])

    errors = []

    def memories(n):
        try:
            for i in range(n):
                with database.get_db() as c:
                    c.execute("INSERT INTO memories (person_id, summary) VALUES (?, ?)", (sample_person, f"m{i}"))
        except Exception as e:                  # noqa: BLE001 — recorded for the assertion
            errors.append(repr(e))

    def visits():
        try:
            tracker = vision.VisitTracker()
            for i in range(60):
                tracker.seen(others[i % 4], 0.8)   # each switch closes one visit and opens the next
        except Exception as e:                  # noqa: BLE001
            errors.append(repr(e))

    def albums():
        try:
            own = app_module.app.test_client()       # a test client belongs to one thread
            own.post("/api/caregiver/login", json={"password": config.CAREGIVER_PASS})
            for i in range(20):
                assert own.post("/api/caregiver/albums", json={"title": f"A{i}"}).status_code == 201
        except Exception as e:                  # noqa: BLE001
            errors.append(repr(e))

    threads = [threading.Thread(target=memories, args=(50,)) for _ in range(4)]
    threads += [threading.Thread(target=visits), threading.Thread(target=albums)]
    vision.speak_greeting, real = (lambda pid: None), vision.speak_greeting
    try:
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=60)
    finally:
        vision.speak_greeting = real

    assert errors == []
    with database.get_db() as c:
        assert c.execute("SELECT COUNT(*) FROM memories").fetchone()[0] == 200
        assert c.execute("SELECT COUNT(*) FROM visits").fetchone()[0] == 60
        assert c.execute("SELECT COUNT(*) FROM albums").fetchone()[0] == 20
        assert c.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert c.execute("PRAGMA foreign_key_check").fetchall() == []
