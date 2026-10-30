"""
Tests for the identity state machine in worker.py (_step): what the patient
screen is told about who is in front of the camera, frame by frame.

Recognition results are synthetic (pid, score) pairs, so these run without
the face models. Thresholds are the real ones from config.
"""
import uuid

import pytest

import config
import database
import vision
import worker

A_SCORE, B_STRONG, B_WEAK, STRANGER = 0.70, 0.65, 0.34, 0.10


@pytest.fixture
def people(temp_db, monkeypatch):
    a, b = str(uuid.uuid4()), str(uuid.uuid4())
    with database.get_db() as c:
        c.execute("INSERT INTO people (id,name,relationship,notes) VALUES (?,?,?,?)",
                  (a, "Sarah", "Daughter", "Visits on Sundays"))
        c.execute("INSERT INTO people (id,name,relationship,notes) VALUES (?,?,?,?)",
                  (b, "John", "Neighbour", "Brings the paper"))
        c.execute("INSERT INTO memories (person_id, summary) VALUES (?, 'You talked about the roses.')", (a,))
        c.execute("INSERT INTO memories (person_id, summary) VALUES (?, 'You watched the football.')", (b,))
    # Replace the map the way load_known_faces() does on every gallery reload.
    monkeypatch.setattr(vision, "_name_map", {a: "Sarah", b: "John"})
    monkeypatch.setattr(worker.visit_tracker, "seen", lambda *a, **k: None)
    worker.reset_state()
    yield a, b
    worker.reset_state()


def frame(pid=None, score=0.0, face=True, names=None):
    """Feed one synthetic frame and return a copy of the resulting detection."""
    name = (names or vision._name_map).get(pid) if pid else None
    worker._step(pid, score, name, face)
    with worker.det_lock:
        return dict(worker.detection)


# ── behaviour that must be kept ──────────────────────────────────────
def test_a_bridged_frame_keeps_the_name_after_a_gallery_reload(people):
    """Phase 8 defect: the worker kept the name map it imported at startup,
    but load_known_faces() replaces it. Bridged frames (blink, turned head,
    visitor stepping away) then reported a confirmed person with no name,
    which the patient screen shows as "I don't recognise this person"."""
    a, _ = people
    for _ in range(3):
        frame(a, A_SCORE)
    d = frame(None, face=False)
    assert d["state"] == "high" and d["person_id"] == a
    assert d["name"] == "Sarah"


def test_a_known_face_is_confirmed_after_consecutive_frames(people):
    a, _ = people
    states = [frame(a, A_SCORE)["state"] for _ in range(3)]
    assert states[-1] == "high"
    d = frame(a, A_SCORE)
    assert d["person_id"] == a and d["relationship"] == "Daughter"
    assert d["last_memory"] == "You talked about the roses."


def test_a_brief_disappearance_is_bridged(people):
    a, _ = people
    for _ in range(3):
        frame(a, A_SCORE)
    for _ in range(3):                       # a blink / turned head: no face detected
        assert frame(None, face=False)["person_id"] == a
    for _ in range(config.STICKY_FRAMES):
        d = frame(None, face=False)
    assert d["state"] == "idle" and d["person_id"] is None   # eventually lets go


def test_a_stranger_replacing_a_known_person_is_dropped_after_the_grace_frames(people):
    a, _ = people
    for _ in range(3):
        frame(a, A_SCORE)
    results = [frame(None, STRANGER) for _ in range(config.UNKNOWN_GRACE_FRAMES + 2)]
    assert results[-1]["state"] == "unknown"
    assert results[-1]["person_id"] is None and results[-1]["last_memory"] is None


def test_switching_between_two_known_people(people):
    a, b = people
    for _ in range(3):
        frame(a, A_SCORE)
    results = [frame(b, B_STRONG) for _ in range(config.UNKNOWN_GRACE_FRAMES + 3)]
    assert results[-1]["state"] == "high" and results[-1]["person_id"] == b
    assert results[-1]["last_memory"] == "You watched the football."


# ── defects found in the Phase 6 audit ───────────────────────────────
def test_a_weak_match_is_never_confirmed_on_the_previous_persons_scores(people):
    """D1: the smoothing window mixed scores from different people, so a
    weak (uncertain) match for John right after Sarah averaged to "high"."""
    a, b = people
    for _ in range(3):
        frame(a, A_SCORE)
    for _ in range(config.UNKNOWN_GRACE_FRAMES + 5):
        d = frame(b, B_WEAK)
        assert not (d["person_id"] == b and d["state"] == "high"), d
    assert d["state"] == "medium" and d["person_id"] == b


def test_an_uncertain_match_carries_no_private_details(people):
    """D2: "This might be John" must not send John's memories or notes."""
    _, b = people
    for _ in range(4):
        d = frame(b, B_WEAK)
    assert d["state"] == "medium" and d["name"] == "John"
    assert d["relationship"] is None and d["notes"] is None
    assert d["last_memory"] is None and d["recent_memories"] == [] and d["last_visit_at"] is None


def test_unknown_and_idle_states_carry_no_identity(people):
    """D4: an "unknown" result still carried the last match's id and name."""
    a, _ = people
    frame(a, 0.36)                           # one weak match, smoothed far below the bar
    d = frame(None, STRANGER)
    assert d["state"] == "unknown" and d["person_id"] is None and d["name"] is None
    d = frame(a, 0.33, face=True)            # a match too weak once smoothed
    assert d["state"] in ("unknown", "medium")
    if d["state"] == "unknown":
        assert d["person_id"] is None and d["name"] is None


def test_the_identity_expires_when_frames_stop_arriving(people, monkeypatch):
    """D3: with no new frames (camera off, tab hidden, stream closed) the
    last identity stayed on screen indefinitely."""
    a, _ = people
    clock = [1000.0]
    monkeypatch.setattr(worker.time, "monotonic", lambda: clock[0])
    for _ in range(3):
        frame(a, A_SCORE)
    clock[0] += config.FRAME_STALE_S - 0.5
    worker._expire_if_stale()
    assert worker.detection["person_id"] == a          # a short pause is fine
    clock[0] += 1.0
    worker._expire_if_stale()
    with worker.det_lock:
        d = dict(worker.detection)
    assert d["state"] == "idle" and d["person_id"] is None and d["last_memory"] is None
    # ...and nothing sticky resurrects Sarah on the next empty frame.
    assert frame(None, face=False)["person_id"] is None


def test_rapid_changes_never_mix_one_persons_details_with_anothers_name(people):
    a, b = people
    sequence = [(a, A_SCORE)] * 3 + [(b, B_STRONG), (a, A_SCORE), (b, B_STRONG), (None, STRANGER)] * 4 + [(b, B_STRONG)] * 6
    owner = {a: "You talked about the roses.", b: "You watched the football."}
    for pid, score in sequence:
        d = frame(pid, score)
        if d["last_memory"] is not None:
            assert d["last_memory"] == owner[d["person_id"]], d
