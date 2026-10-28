"""
worker.py — the recognition worker thread and the shared state it writes.

This is the "consumer" side of the producer-consumer queue: generate_frames
(in camera.py) is the producer, this thread is the consumer. See the
project README for the full threading diagram.
"""
import queue
import threading
from collections import deque

import numpy as np

import config
from database import get_db
from vision import recognize, visit_tracker, _name_map

frame_q      = queue.Queue(maxsize=config.FRAME_QUEUE_SIZE)
_score_buffer = deque(maxlen=config.SMOOTH_WINDOW)

detection = {
    "person_id": None, "name": None, "confidence": 0.0, "state": "idle",
    "emotion": None, "relationship": None, "notes": None,
    "last_memory": None, "recent_memories": [], "last_visit_at": None,
}
det_lock = threading.Lock()

_sticky_pid     = None
_sticky_count   = 0
_unknown_streak = 0


def _get_person_data(pid):
    """Everything the patient screen needs for recall."""
    with get_db() as c:
        p = c.execute("SELECT * FROM people WHERE id=?", (pid,)).fetchone()
        mems = c.execute(
            "SELECT summary, created_at FROM memories "
            "WHERE person_id=? ORDER BY created_at DESC LIMIT 3",
            (pid,)
        ).fetchall()
        # The previous *completed* visit. The visit in progress has no
        # ended_at yet, so it never shows up as "last time".
        last_visit = c.execute(
            "SELECT started_at FROM visits WHERE person_id=? AND ended_at IS NOT NULL "
            "ORDER BY started_at DESC LIMIT 1",
            (pid,)
        ).fetchone()
    if not p:
        return None
    return {
        "id": p["id"], "name": p["name"],
        "relationship": p["relationship"], "notes": p["notes"],
        "last_memory": mems[0]["summary"] if mems else None,
        "recent_memories": [{"summary": m["summary"], "when": m["created_at"]} for m in mems],
        "last_visit_at": last_visit["started_at"] if last_visit else None,
    }


def _recognition_worker():
    global _sticky_pid, _sticky_count, _unknown_streak
    while True:
        try:
            item = frame_q.get(timeout=1.0)
        except queue.Empty:
            continue
        bgr, face_row = item
        face_present = face_row is not None

        pid, score, name = recognize(bgr, face_row) if face_present else (None, 0.0, None)

        _score_buffer.append(score if pid else 0.0)
        smooth = float(np.mean(_score_buffer))

        if pid and smooth >= config.SCORE_HIGH:
            state = "high"
        elif pid and smooth >= config.SCORE_MEDIUM:
            state = "medium"
        elif face_present:
            state = "unknown"
        else:
            state = "idle"

        # Sticky: bridge brief gaps without ever lying about identity.
        if state == "high" and pid:
            _sticky_pid, _sticky_count, _unknown_streak = pid, config.STICKY_FRAMES, 0
        elif face_present and pid != _sticky_pid and _sticky_pid:
            _unknown_streak += 1
            if _unknown_streak < config.UNKNOWN_GRACE_FRAMES and _sticky_count > 0:
                _sticky_count -= 1
                pid, name, state = _sticky_pid, _name_map.get(_sticky_pid), "high"
            else:
                _sticky_pid, _sticky_count = None, 0
        elif not face_present and _sticky_pid:
            if _sticky_count > 0:
                _sticky_count -= 1
                pid, name, state = _sticky_pid, _name_map.get(_sticky_pid), "high"
            else:
                _sticky_pid = None
        else:
            _unknown_streak = 0

        person_data = None
        if pid and state in ("high", "medium"):
            person_data = _get_person_data(pid)
            if state == "high":
                visit_tracker.seen(pid, smooth)
        visit_tracker.tick()

        with det_lock:
            detection.update({
                "person_id": pid, "name": name,
                "confidence": round(smooth, 3), "state": state,
                "emotion": None,
                "relationship": person_data["relationship"] if person_data else None,
                "notes": person_data["notes"] if person_data else None,
                "last_memory": person_data["last_memory"] if person_data else None,
                "recent_memories": person_data["recent_memories"] if person_data else [],
                "last_visit_at": person_data["last_visit_at"] if person_data else None,
            })


def start_worker():
    """Starts the recognition worker as a daemon thread. Called explicitly
    from app.py's startup — NOT at import time, so importing this module
    (e.g. from tests) never spins up a background thread unexpectedly."""
    threading.Thread(target=_recognition_worker, daemon=True).start()