"""
accounts.py — sandbox accounts (SANDBOX_MODE=1).

Each account owns a private, temporary copy of the app: its own SQLite
database, face photos, family photos and uploads under
DATA_DIR/tenants/<random id>/, seeded with a fictional family. Accounts
expire after SANDBOX_DAYS and are deleted with all their files; a visitor
can also delete theirs at once. Only a username (never an email) and a
salted password hash are stored.
"""
import gc
import logging
import re
import secrets
import shutil
import sqlite3
import threading
import time

from werkzeug.security import check_password_hash, generate_password_hash

import config
import database

log = logging.getLogger(__name__)

USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,31}$")
MIN_PASSWORD, MAX_PASSWORD = 10, 128
_create_lock = threading.Lock()
# Compared against when a username does not exist, so a wrong username takes
# as long as a wrong password.
_DUMMY_HASH = generate_password_hash(secrets.token_urlsafe(16))


class AccountError(Exception):
    """A request the visitor can fix (shown to them as is)."""


def _db():
    conn = sqlite3.connect(config.ACCOUNTS_DB, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init():
    config.TENANTS_DIR.mkdir(parents=True, exist_ok=True)
    with _db() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at REAL NOT NULL,
                expires_at REAL NOT NULL,
                consent_at REAL NOT NULL,
                last_login_at REAL
            )""")


def _public(row):
    return {"username": row["username"], "created_at": row["created_at"], "expires_at": row["expires_at"]}


def active_count():
    with _db() as c:
        return c.execute("SELECT COUNT(*) FROM accounts WHERE expires_at > ?", (time.time(),)).fetchone()[0]


def create(username, password, consent):
    """New sandbox with the fictional family. Returns (account id, public info)."""
    username = (username or "").strip().lower()
    if not USERNAME_RE.match(username):
        raise AccountError("Choose a username of 3–32 letters, numbers, dots, dashes or underscores.")
    if not isinstance(password, str) or not MIN_PASSWORD <= len(password) <= MAX_PASSWORD:
        raise AccountError(f"Choose a password of at least {MIN_PASSWORD} characters.")
    if password.lower() == username:
        raise AccountError("Your password can't be your username.")
    if consent is not True:
        raise AccountError("Please confirm how face photos are used in your sandbox.")
    import sandbox_seed
    with _create_lock:
        if active_count() >= config.SANDBOX_MAX:
            raise AccountError("The demo is full right now. Please try again later.")
        with _db() as c:
            if c.execute("SELECT 1 FROM accounts WHERE username=?", (username,)).fetchone():
                raise AccountError("That username is taken.")
        account_id = secrets.token_hex(16)
        root = config.tenant_root(account_id)
        root.mkdir(parents=True)
        token = config.set_tenant(account_id)
        try:
            database.init_db()
            sandbox_seed.seed()
        except Exception:
            shutil.rmtree(root, ignore_errors=True)
            raise
        finally:
            config.reset_tenant(token)
        now = time.time()
        with _db() as c:
            c.execute("INSERT INTO accounts (id, username, password_hash, created_at, expires_at, consent_at, last_login_at) "
                      "VALUES (?,?,?,?,?,?,?)",
                      (account_id, username, generate_password_hash(password), now,
                       now + config.SANDBOX_DAYS * 86400, now, now))
            row = c.execute("SELECT * FROM accounts WHERE id=?", (account_id,)).fetchone()
    log.info("Sandbox created (%d active)", active_count())
    return account_id, _public(row)


def authenticate(username, password):
    """(account id, public info) for the right password, else None."""
    with _db() as c:
        row = c.execute("SELECT * FROM accounts WHERE username=? AND expires_at > ?",
                        ((username or "").strip().lower(), time.time())).fetchone()
    if row is None:
        check_password_hash(_DUMMY_HASH, password or "")
        return None
    if not check_password_hash(row["password_hash"], password or ""):
        return None
    with _db() as c:
        c.execute("UPDATE accounts SET last_login_at=? WHERE id=?", (time.time(), row["id"]))
    return row["id"], _public(row)


def get(account_id):
    """Public info of a live (not expired, not deleted) account, else None."""
    if not account_id:
        return None
    with _db() as c:
        row = c.execute("SELECT * FROM accounts WHERE id=? AND expires_at > ?", (account_id, time.time())).fetchone()
    return _public(row) if row else None


def delete(account_id):
    """Remove the account and every file of its sandbox."""
    import vision
    import worker
    with _db() as c:
        c.execute("DELETE FROM accounts WHERE id=?", (account_id,))
    vision.forget_tenant(account_id)
    worker.forget_tenant(account_id)
    gc.collect()        # close SQLite connections nobody holds any more (Windows won't delete open files)
    shutil.rmtree(config.tenant_root(account_id), ignore_errors=True)


def purge_expired():
    with _db() as c:
        ids = [r["id"] for r in c.execute("SELECT id FROM accounts WHERE expires_at <= ?", (time.time(),))]
    for account_id in ids:
        delete(account_id)
    # Folders left without an account (e.g. a crash during sign-up).
    with _db() as c:
        known = {r["id"] for r in c.execute("SELECT id FROM accounts")}
    for d in config.TENANTS_DIR.glob("*"):
        if d.is_dir() and d.name not in known and time.time() - d.stat().st_mtime > 3600:
            shutil.rmtree(d, ignore_errors=True)
            ids.append(d.name)
    if ids:
        log.info("Deleted %d expired sandbox(es)", len(ids))
    return len(ids)


def start_purger(every_s=900):
    def loop():
        while True:
            try:
                purge_expired()
            except Exception as e:                      # never let the purger die
                log.warning("Sandbox clean-up failed (%s)", type(e).__name__)
            time.sleep(every_s)
    threading.Thread(target=loop, daemon=True, name="sandbox-purger").start()
