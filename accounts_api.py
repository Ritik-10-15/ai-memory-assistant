"""
accounts_api.py — sign-up, sign-in and sign-out for sandbox accounts, and
the per-request switch into the signed-in visitor's sandbox.

Only active with SANDBOX_MODE=1. In that mode the household logins (shared
caregiver password, patient PIN) are switched off: everything is reached
through a visitor's own account, and every request works only on that
visitor's files.
"""
import threading
import time
from collections import defaultdict, deque

from flask import abort, jsonify, request, session

import accounts
import config
from app_instance import app
from auth import clear_failures, record_failure, retry_after

SIGNUPS_PER_HOUR = 5          # per client address
_signups = defaultdict(deque)
_signups_lock = threading.Lock()

# Household sign-ins that do not exist in sandbox mode.
_HOUSEHOLD_LOGINS = {"/api/caregiver/login", "/api/patient/login"}


def _error(message, status):
    return jsonify({"error": message}), status


def _signed_in(account_id):
    session.clear()
    session.permanent = False                 # ends when the browser closes
    session["account"] = account_id
    session["account_at"] = time.time()


@app.before_request
def _enter_sandbox():
    """Run this request in the signed-in visitor's sandbox (or in none)."""
    if not config.SANDBOX_MODE:
        return None
    if request.path in _HOUSEHOLD_LOGINS or (request.method == "POST" and request.path in ("/caregiver/login", "/patient/login")):
        abort(404)
    account_id = session.get("account")
    started = session.get("account_at")
    fresh = isinstance(started, (int, float)) and time.time() - started < config.CAREGIVER_SESSION_HOURS * 3600
    if account_id and fresh and accounts.get(account_id):
        request.environ["memory_assistant.tenant_token"] = config.set_tenant(account_id)
    elif account_id:
        session.clear()                       # expired, deleted or too old: sign in again
    return None


@app.teardown_request
def _leave_sandbox(_exc=None):
    token = request.environ.pop("memory_assistant.tenant_token", None)
    if token is not None:
        config.reset_tenant(token)


def _sandbox_only():
    if not config.SANDBOX_MODE:
        abort(404)


@app.route("/api/account/signup", methods=["POST"])
def api_signup():
    _sandbox_only()
    data = request.get_json(silent=True) or {}
    now = time.time()
    with _signups_lock:
        recent = _signups[request.remote_addr]
        while recent and now - recent[0] > 3600:
            recent.popleft()
        if len(recent) >= SIGNUPS_PER_HOUR:
            return _error("Too many new sandboxes from here. Please try again later.", 429)
    try:
        account_id, info = accounts.create(data.get("username"), data.get("password"), data.get("consent"))
    except accounts.AccountError as e:
        return _error(str(e), 400)
    with _signups_lock:
        _signups[request.remote_addr].append(now)
    _signed_in(account_id)
    return jsonify({"account": info}), 201


@app.route("/api/account/login", methods=["POST"])
def api_account_login():
    _sandbox_only()
    wait = retry_after("account")
    if wait:
        resp = jsonify({"error": "Too many attempts. Please wait a few minutes and try again.", "retry_after": wait})
        resp.headers["Retry-After"] = str(wait)
        return resp, 429
    data = request.get_json(silent=True) or {}
    found = accounts.authenticate(data.get("username"), data.get("password"))
    if not found:
        record_failure("account")
        return _error("Wrong username or password.", 401)
    clear_failures("account")
    _signed_in(found[0])
    return jsonify({"account": found[1]})


@app.route("/api/account/logout", methods=["POST"])
def api_account_logout():
    _sandbox_only()
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/account")
def api_account():
    _sandbox_only()
    info = accounts.get(config.tenant())
    if not info:
        return _error("Not signed in", 401)
    return jsonify({"account": info})


@app.route("/api/account", methods=["DELETE"])
def api_delete_account():
    """Delete the visitor's sandbox now: account, people, faces, photos — everything."""
    _sandbox_only()
    account_id = config.tenant()
    if not account_id:
        return _error("Not signed in", 401)
    accounts.delete(account_id)
    session.clear()
    return jsonify({"ok": True})
