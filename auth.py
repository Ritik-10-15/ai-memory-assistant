"""
auth.py — session gates for the patient screen and caregiver panel, plus a
small failed-login throttle.

Pages redirect to the matching login screen; anything under /api/ gets a
JSON 401 instead, so the React frontend can react without following an
HTML redirect.
"""
import hmac
import threading
import time
from collections import defaultdict, deque
from functools import wraps

from flask import jsonify, redirect, request, session, url_for

import config


def _wants_json():
    return request.path.startswith("/api/")


def caregiver_required(f):
    @wraps(f)
    def dec(*a, **kw):
        if not session.get("caregiver"):
            if _wants_json():
                return jsonify({"error": "Caregiver sign-in required"}), 401
            return redirect(url_for("caregiver_login"))
        return f(*a, **kw)
    return dec


def patient_required(f):
    """Gate the patient screen behind PATIENT_PIN when one is configured.
    A caregiver session also opens it."""
    @wraps(f)
    def dec(*a, **kw):
        if config.PATIENT_PIN and not (session.get("patient") or session.get("caregiver")):
            if _wants_json():
                return jsonify({"error": "Not signed in"}), 401
            return redirect(url_for("patient_login"))
        return f(*a, **kw)
    return dec


def secret_matches(given, expected):
    """Constant-time comparison so response timing can't leak the secret."""
    return bool(expected) and hmac.compare_digest(str(given or "").encode(), str(expected).encode())


# ── Failed-login throttle ─────────────────────────────────────────────
# A 6-digit PIN has only a million values; without a limit it could be
# guessed by script. After MAX_FAILURES wrong attempts from one address
# within WINDOW_S, further attempts are refused until the window passes.
MAX_FAILURES = 5
WINDOW_S = 300

_failures = defaultdict(deque)
_failures_lock = threading.Lock()


def _key(scope):
    return f"{scope}:{request.remote_addr}"


def retry_after(scope):
    """Seconds until another attempt is allowed (0 = allowed now)."""
    now = time.time()
    with _failures_lock:
        q = _failures[_key(scope)]
        while q and now - q[0] > WINDOW_S:
            q.popleft()
        if len(q) >= MAX_FAILURES:
            return int(WINDOW_S - (now - q[0])) + 1
    return 0


def record_failure(scope):
    with _failures_lock:
        _failures[_key(scope)].append(time.time())


def clear_failures(scope):
    with _failures_lock:
        _failures.pop(_key(scope), None)
