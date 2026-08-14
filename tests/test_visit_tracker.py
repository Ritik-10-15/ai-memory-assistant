"""
VisitTracker tests — the session-based visit logging that replaced the
old "one row per recognition frame" behavior.

These are the exact rules a "visit" is supposed to follow:
  - seeing the same person again refreshes the open visit, no duplicate row
  - a different person closes the old visit and opens a new one
  - tick() only closes a visit once the cooldown window has passed
"""
import time
import app as app_module


def _visit_count(pid=None):
    with app_module.get_db() as c:
        if pid:
            return c.execute(
                "SELECT COUNT(*) FROM visits WHERE person_id=?", (pid,)
            ).fetchone()[0]
        return c.execute("SELECT COUNT(*) FROM visits").fetchone()[0]


def test_seen_creates_one_visit(temp_db, sample_person):
    tracker = app_module.VisitTracker()
    tracker.seen(sample_person, 0.85)
    assert _visit_count(sample_person) == 1


def test_repeated_seen_same_person_does_not_duplicate(temp_db, sample_person):
    tracker = app_module.VisitTracker()
    tracker.seen(sample_person, 0.85)
    tracker.seen(sample_person, 0.80)
    tracker.seen(sample_person, 0.90)
    # Same person seen 3 times in a row -> still just ONE visit row.
    assert _visit_count(sample_person) == 1


def test_different_person_closes_old_and_opens_new(temp_db):
    with app_module.get_db() as c:
        c.execute("INSERT INTO people (id,name) VALUES ('a','Alice')")
        c.execute("INSERT INTO people (id,name) VALUES ('b','Bob')")

    tracker = app_module.VisitTracker()
    tracker.seen("a", 0.85)
    tracker.seen("b", 0.85)  # Bob appears -> Alice's visit should close

    assert _visit_count("a") == 1
    assert _visit_count("b") == 1

    with app_module.get_db() as c:
        alice_visit = c.execute(
            "SELECT ended_at FROM visits WHERE person_id='a'"
        ).fetchone()
    assert alice_visit["ended_at"] is not None  # closed, not left open


def test_tick_does_not_close_before_cooldown(temp_db, sample_person):
    tracker = app_module.VisitTracker()
    tracker.VISIT_COOLDOWN_S = 30
    tracker.seen(sample_person, 0.85)
    tracker.tick()  # called immediately, well within cooldown

    with app_module.get_db() as c:
        row = c.execute(
            "SELECT ended_at FROM visits WHERE person_id=?", (sample_person,)
        ).fetchone()
    assert row["ended_at"] is None  # still open


def test_tick_closes_visit_after_cooldown_elapses(temp_db, sample_person):
    tracker = app_module.VisitTracker()
    tracker.VISIT_COOLDOWN_S = 0.05  # tiny window so the test runs fast
    tracker.seen(sample_person, 0.85)
    time.sleep(0.1)
    tracker.tick()

    with app_module.get_db() as c:
        row = c.execute(
            "SELECT ended_at FROM visits WHERE person_id=?", (sample_person,)
        ).fetchone()
    assert row["ended_at"] is not None  # cooldown passed -> closed


def test_seen_with_no_pid_does_not_create_a_visit(temp_db):
    tracker = app_module.VisitTracker()
    tracker.seen(None, 0.0)
    assert _visit_count() == 0