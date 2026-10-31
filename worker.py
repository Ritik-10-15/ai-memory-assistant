"""
worker.py — the recognition worker thread and the shared state it writes.

This is the "consumer" side of the producer-consumer queue: generate_frames
(in camera.py) is the producer, this thread is the consumer. See the
project README for the full threading diagram.
"""
import queue
import threading
import time
from collections import OrderedDict, deque

import numpy as np

import config
from database import get_db
from vision import VisitTracker, display_name, recognize, visit_tracker


class LatestFrames(queue.Queue):
    """Frame buffer for the recognition worker. When the worker falls behind
    and the buffer is full, the OLDEST waiting frame is dropped to make room
    (a plain Queue would refuse the newest instead), so the worker always
    moves on to what the camera sees now rather than a moment ago."""

    def put_nowait(self, item):
        with self.not_full:
            dropped = 0 < self.maxsize <= self._qsize()
            if dropped:
                self._get()
            self._put(item)
            if not dropped:
                self.unfinished_tasks += 1
            self.not_empty.notify()


class TenantFrames(LatestFrames):
    """The same newest-frame buffer, kept separately for each sandbox: a new
    frame replaces only that sandbox's waiting frame, and the worker takes
    sandboxes in turn, so one visitor's camera can never crowd out or stand
    in for another's. Items are (bgr, face_row, tenant); in the household
    mode there is one tenant, None, and it behaves exactly like LatestFrames(1)."""

    def _init(self, maxsize):
        self.queue = OrderedDict()

    def _qsize(self):
        return len(self.queue)

    def _put(self, item):
        self.queue[item[2] if isinstance(item, tuple) and len(item) > 2 else None] = item

    def _get(self):
        return self.queue.popitem(last=False)[1]

    def put_nowait(self, item):
        with self.not_full:
            key = item[2] if isinstance(item, tuple) and len(item) > 2 else None
            replaced = key in self.queue
            self._put(item)
            if not replaced:
                self.unfinished_tasks += 1
            self.not_empty.notify()


frame_q = TenantFrames()


class RecognitionState:
    """Everything the identity state machine remembers between frames, for
    one household or one sandbox."""

    def __init__(self, detection=None, lock=None, tracker=None):
        self.detection = detection if detection is not None else dict(_IDLE)
        self.lock = lock or threading.Lock()
        self.visit_tracker = tracker or VisitTracker()
        self.score_buffer = deque(maxlen=config.SMOOTH_WINDOW)
        self.sticky_pid = None
        self.sticky_count = 0
        self.unknown_streak = 0
        self.last_frame_at = None   # time.monotonic() of the last frame processed
        self.no_face = 0            # consecutive frames without a face (camera.py)


_IDLE = {
    "person_id": None, "name": None, "confidence": 0.0, "state": "idle",
    "emotion": None, "relationship": None, "notes": None,
    "last_memory": None, "recent_memories": [], "last_visit_at": None,
}

# The household's state keeps its module-level names (camera.py, routes.py, tests).
detection = dict(_IDLE)
det_lock = threading.Lock()
_states = {None: RecognitionState(detection, det_lock, visit_tracker)}
_states_lock = threading.Lock()


def state(tenant=...):
    """Recognition state of `tenant` (default: the current one)."""
    key = config.tenant() if tenant is ... else tenant
    with _states_lock:
        st = _states.get(key)
        if st is None:
            st = _states[key] = RecognitionState()
        return st


_current_state = state


def forget_tenant(tenant_id):
    """A deleted sandbox: drop its recognition state and any waiting frame."""
    with _states_lock:
        _states.pop(tenant_id, None)
    with frame_q.mutex:
        frame_q.queue.pop(tenant_id, None)


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
    while True:
        try:
            item = frame_q.get(timeout=1.0)
        except queue.Empty:
            for key in list(_states):
                token = config.set_tenant(key)
                try:
                    _expire_if_stale()
                    state().visit_tracker.tick()   # visits still close while no frames arrive
                finally:
                    config.reset_tenant(token)
            continue
        bgr, face_row = item[0], item[1]
        token = config.set_tenant(item[2] if len(item) > 2 else None)
        try:
            face_present = face_row is not None
            pid, score, name = recognize(bgr, face_row) if face_present else (None, 0.0, None)
            _step(pid, score, name, face_present)
        finally:
            config.reset_tenant(token)


def _step(pid, score, name, face_present):
    """Turn one frame's recognition result into the shared `detection`:
    smoothing, sticky identity, visit tracking. Separate from the loop so
    the identity state machine can be tested with synthetic results."""
    st = _current_state()          # (`state` below is the recognition state string)
    st.last_frame_at = time.monotonic()
    # Smooth per identity: frames that matched someone else (or no one)
    # count as 0 for this person, so a weak match can never be confirmed
    # on the strength of the previous visitor's scores.
    st.score_buffer.append((pid, score if pid else 0.0))
    smooth = float(np.mean([s if p == pid else 0.0 for p, s in st.score_buffer])) if pid else 0.0

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
        st.sticky_pid, st.sticky_count, st.unknown_streak = pid, config.STICKY_FRAMES, 0
    elif face_present and pid != st.sticky_pid and st.sticky_pid:
        st.unknown_streak += 1
        if st.unknown_streak < config.UNKNOWN_GRACE_FRAMES and st.sticky_count > 0:
            st.sticky_count -= 1
            pid, name, state = st.sticky_pid, display_name(st.sticky_pid), "high"
        else:
            st.sticky_pid, st.sticky_count = None, 0
    elif not face_present and st.sticky_pid:
        if st.sticky_count > 0:
            st.sticky_count -= 1
            pid, name, state = st.sticky_pid, display_name(st.sticky_pid), "high"
        else:
            st.sticky_pid = None
    else:
        st.unknown_streak = 0

    # Only a confirmed identity carries a name beyond "might be", and only a
    # confirmed identity carries private details (relationship, notes,
    # memories). Unknown / idle carry no identity at all.
    if state not in ("high", "medium"):
        pid = name = None
    person_data = None
    if pid and state == "high":
        person_data = _get_person_data(pid)
        st.visit_tracker.seen(pid, smooth)
    st.visit_tracker.tick()

    with st.lock:
        st.detection.update({
            "person_id": pid, "name": name,
            "confidence": round(smooth, 3), "state": state,
            "emotion": None,
            "relationship": person_data["relationship"] if person_data else None,
            "notes": person_data["notes"] if person_data else None,
            "last_memory": person_data["last_memory"] if person_data else None,
            "recent_memories": person_data["recent_memories"] if person_data else [],
            "last_visit_at": person_data["last_visit_at"] if person_data else None,
        })


def _expire_if_stale():
    """Called while no frames arrive. After FRAME_STALE_S without a frame,
    nobody can be vouched for: drop the identity rather than keep showing
    the last visitor (and their memories) indefinitely."""
    st = state()
    if st.last_frame_at is None or time.monotonic() - st.last_frame_at < config.FRAME_STALE_S:
        return
    with st.lock:
        active = st.detection["state"] != "idle"
    if active or st.sticky_pid:
        reset_state()


def reset_state():
    """Forget the current identity entirely (tests; also used when frames stop)."""
    st = state()
    st.score_buffer.clear()
    st.sticky_pid, st.sticky_count, st.unknown_streak = None, 0, 0
    with st.lock:
        st.detection.update({**_IDLE, "recent_memories": []})


_thread = None


def start_worker():
    """Starts the recognition worker as a daemon thread. Called explicitly
    from app.py's startup — NOT at import time, so importing this module
    (e.g. from tests) never spins up a background thread unexpectedly."""
    global _thread
    _thread = threading.Thread(target=_recognition_worker, daemon=True, name="recognition-worker")
    _thread.start()


def is_running():
    return _thread is not None and _thread.is_alive()