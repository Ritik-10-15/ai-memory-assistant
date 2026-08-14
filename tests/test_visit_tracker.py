"""VisitTracker tests — session-based visit logging, now in vision.py."""
import time
import database
import vision


def _visit_count(pid=None):
    with database.get_db() as c:
        if pid:
            return c.execute(
                "SELECT COUNT(*) FROM visits WHERE person_id=?", (pid,)
            ).fetchone()[0]
        return c.execute("SELECT COUNT(*) FROM visits").fetchone()[0]


def test_seen_creates_one_visit(temp_db, sample_person):
    tracker = vision.VisitTracker()
    tracker.seen(sample_person, 0.85)
    assert _visit_count(sample_person) == 1


def test_repeated_seen_same_person_does_not_duplicate(temp_db, sample_person):
    tracker = vision.VisitTracker()
    tracker.seen(sample_person, 0.85)
    tracker.seen(sample_person, 0.80)
    tracker.seen(sample_person, 0.90)
    assert _visit_count(sample_person) == 1


def test_different_person_closes_old_and_opens_new(temp_db):
    with database.get_db() as c:
        c.execute("INSERT INTO people (id,name) VALUES ('a','Alice')")
        c.execute("INSERT INTO people (id,name) VALUES ('b','Bob')")

    tracker = vision.VisitTracker()
    tracker.seen("a", 0.85)
    tracker.seen("b", 0.85)  # Bob appears -> Alice's visit should close

    assert _visit_count("a") == 1
    assert _visit_count("b") == 1

    with database.get_db() as c:
        alice_visit = c.execute(
            "SELECT ended_at FROM visits WHERE person_id='a'"
        ).fetchone()
    assert alice_visit["ended_at"] is not None


def test_tick_does_not_close_before_cooldown(temp_db, sample_person):
    tracker = vision.VisitTracker()
    tracker.VISIT_COOLDOWN_S = 30
    tracker.seen(sample_person, 0.85)
    tracker.tick()

    with database.get_db() as c:
        row = c.execute(
            "SELECT ended_at FROM visits WHERE person_id=?", (sample_person,)
        ).fetchone()
    assert row["ended_at"] is None


def test_tick_closes_visit_after_cooldown_elapses(temp_db, sample_person):
    tracker = vision.VisitTracker()
    tracker.VISIT_COOLDOWN_S = 0.05
    tracker.seen(sample_person, 0.85)
    time.sleep(0.1)
    tracker.tick()

    with database.get_db() as c:
        row = c.execute(
            "SELECT ended_at FROM visits WHERE person_id=?", (sample_person,)
        ).fetchone()
    assert row["ended_at"] is not None


def test_seen_with_no_pid_does_not_create_a_visit(temp_db):
    tracker = vision.VisitTracker()
    tracker.seen(None, 0.0)
    assert _visit_count() == 0